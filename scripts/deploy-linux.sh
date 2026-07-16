#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/tmp/earthquake-upload}"
ZIP_PATH="${ZIP_PATH:-/home/ftpuser/web.zip}"
SERVICE_NAME="${SERVICE_NAME:-earthquake-screen}"
SERVICE_USER="${SERVICE_USER:-ftpuser}"
PORT="${PORT:-3000}"
RECONFIGURE="${RECONFIGURE:-0}"
REQUIRE_PUSH_READY="${REQUIRE_PUSH_READY:-0}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-}"
DATA_SOURCE_DIR="${DATA_SOURCE_DIR:-}"
DEPLOY_SCRIPT_REVISION="r26-nonblocking-push-preflight-1"
DEPLOY_MIN_AVAILABLE_MB="${DEPLOY_MIN_AVAILABLE_MB:-384}"
DEPLOY_MIN_DISK_MB="${DEPLOY_MIN_DISK_MB:-384}"
DEPLOY_NODE_HEAP_MB="${DEPLOY_NODE_HEAP_MB:-256}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi
if [[ ! -f "${ZIP_PATH}" ]]; then
  echo "Archive not found: ${ZIP_PATH}" >&2
  exit 1
fi
if [[ "${APP_DIR}" != /* || "${APP_DIR}" == "/" || "${APP_DIR}" == "/tmp" || "${APP_DIR}" == "/home" ]]; then
  echo "Unsafe APP_DIR: ${APP_DIR}" >&2
  exit 1
fi
if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  echo "Service user does not exist: ${SERVICE_USER}" >&2
  exit 1
fi
if [[ ! "${SERVICE_NAME}" =~ ^[A-Za-z0-9_.@-]+$ || "${SERVICE_NAME}" == *.service ]]; then
  echo "SERVICE_NAME must be a systemd unit base name without the .service suffix: ${SERVICE_NAME}" >&2
  exit 1
fi
if [[ ! "${PORT}" =~ ^[1-9][0-9]{0,4}$ || "${PORT}" -gt 65535 ]]; then
  echo "Invalid PORT: ${PORT}" >&2
  exit 1
fi
if [[ ! "${REQUIRE_PUSH_READY}" =~ ^[01]$ ]]; then
  echo "REQUIRE_PUSH_READY must be 0 or 1." >&2
  exit 1
fi
for value in DEPLOY_MIN_AVAILABLE_MB DEPLOY_MIN_DISK_MB DEPLOY_NODE_HEAP_MB; do
  if [[ ! "${!value}" =~ ^[1-9][0-9]*$ ]]; then
    echo "${value} must be a positive integer." >&2
    exit 1
  fi
done
if [[ -L "${APP_DIR}" ]]; then
  echo "APP_DIR must not be a symbolic link: ${APP_DIR}" >&2
  exit 1
fi
for command_name in node npm unzip curl systemctl; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command_name}" >&2
    exit 1
  fi
done

STAGE_DIR="$(mktemp -d /tmp/earthquake-stage.XXXXXX)"
KEEP_DIR="$(mktemp -d /tmp/earthquake-keep.XXXXXX)"
SAFE_STOP_DIR="/run/systemd/system/${SERVICE_NAME}.service.d"
SAFE_STOP_FILE="${SAFE_STOP_DIR}/zzzz-earthquake-deploy-safe-stop.conf"
SAFE_STOP_ACTIVE=0

remove_safe_stop_override() {
  if [[ "${SAFE_STOP_ACTIVE}" != "1" ]]; then return; fi
  rm -f -- "${SAFE_STOP_FILE}"
  rmdir --ignore-fail-on-non-empty "${SAFE_STOP_DIR}" 2>/dev/null || true
  systemctl daemon-reload 2>/dev/null || true
  SAFE_STOP_ACTIVE=0
}

cleanup() {
  remove_safe_stop_override
  rm -rf -- "${STAGE_DIR}" "${KEEP_DIR}"
}
trap cleanup EXIT

resource_preflight() {
  local memory_available_kb swap_free_kb combined_available_kb minimum_available_kb disk_available_kb minimum_disk_kb
  memory_available_kb="$(awk '/^MemAvailable:/ { print $2; exit }' /proc/meminfo)"
  swap_free_kb="$(awk '/^SwapFree:/ { print $2; exit }' /proc/meminfo)"
  memory_available_kb="${memory_available_kb:-0}"
  swap_free_kb="${swap_free_kb:-0}"
  combined_available_kb=$((memory_available_kb + swap_free_kb))
  minimum_available_kb=$((DEPLOY_MIN_AVAILABLE_MB * 1024))
  if (( combined_available_kb < minimum_available_kb )); then
    echo "Deployment refused before touching the running service: available memory plus free swap is $((combined_available_kb / 1024)) MB; ${DEPLOY_MIN_AVAILABLE_MB} MB is required." >&2
    exit 1
  fi

  disk_available_kb="$(df -Pk "${STAGE_DIR}" | awk 'NR == 2 { print $4 }')"
  disk_available_kb="${disk_available_kb:-0}"
  minimum_disk_kb=$((DEPLOY_MIN_DISK_MB * 1024))
  if (( disk_available_kb < minimum_disk_kb )); then
    echo "Deployment refused before touching the running service: /tmp has $((disk_available_kb / 1024)) MB free; ${DEPLOY_MIN_DISK_MB} MB is required." >&2
    exit 1
  fi
  echo "Resource preflight passed: $((combined_available_kb / 1024)) MB memory/swap available, $((disk_available_kb / 1024)) MB free in /tmp."
}

push_network_preflight() {
  local attempt
  for attempt in 1 2 3; do
    if node scripts/push-network-check.js; then
      return 0
    fi
    if [[ "${attempt}" -lt 3 ]]; then
      echo "Push relay preflight attempt ${attempt}/3 failed; retrying before the live service is touched." >&2
      sleep $((attempt * 2))
    fi
  done
  return 1
}

resource_preflight
unzip -q "${ZIP_PATH}" -d "${STAGE_DIR}"
PACKAGE_ROOT="${STAGE_DIR}"
if [[ ! -f "${PACKAGE_ROOT}/package.json" ]]; then
  mapfile -t roots < <(find "${STAGE_DIR}" -mindepth 1 -maxdepth 1 -type d)
  if [[ "${#roots[@]}" -eq 1 && -f "${roots[0]}/package.json" ]]; then
    PACKAGE_ROOT="${roots[0]}"
  fi
fi
if [[ ! -f "${PACKAGE_ROOT}/package.json" || ! -f "${PACKAGE_ROOT}/server.js" ]]; then
  echo "Archive does not contain the expected Node application." >&2
  exit 1
fi
if [[ ! -f "${PACKAGE_ROOT}/package.json" || ! -f "${PACKAGE_ROOT}/scripts/version.js" ]]; then
  echo "Archive does not contain package version metadata." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm must be installed before deployment." >&2
  exit 1
fi
EXPECTED_ASSET_VERSION="$(cd "${PACKAGE_ROOT}" && node -p "require('./scripts/version').assetVersion")"
if [[ ! "${EXPECTED_ASSET_VERSION}" =~ ^[A-Za-z0-9._-]{2,80}$ ]]; then
  echo "Archive contains an invalid release version." >&2
  exit 1
fi

mkdir -p "${APP_DIR}"
ENV_CHANGED=0
if [[ -f "${APP_DIR}/.env" ]]; then
  cp -a "${APP_DIR}/.env" "${KEEP_DIR}/.env"
fi
if [[ -n "${DATA_SOURCE_DIR}" ]]; then
  if [[ "${DATA_SOURCE_DIR}" != /* || ! -d "${DATA_SOURCE_DIR}" ]]; then
    echo "DATA_SOURCE_DIR must be an existing absolute data directory: ${DATA_SOURCE_DIR}" >&2
    exit 1
  fi
  cp -a "${DATA_SOURCE_DIR}" "${KEEP_DIR}/data"
  echo "Migrating persistent runtime data from ${DATA_SOURCE_DIR}."
elif [[ -d "${APP_DIR}/data" ]]; then
  cp -a "${APP_DIR}/data" "${KEEP_DIR}/data"
fi

PACKAGED_ENV="${PACKAGE_ROOT}/.env"
if [[ -f "${PACKAGED_ENV}" ]]; then
  if [[ -f "${KEEP_DIR}/.env" ]]; then
    MERGED_ENV="${KEEP_DIR}/.env.merged"
    node "${PACKAGE_ROOT}/scripts/merge-env.js" "${KEEP_DIR}/.env" "${PACKAGED_ENV}" "${MERGED_ENV}"
    if cmp -s "${KEEP_DIR}/.env" "${MERGED_ENV}"; then
      rm -f -- "${MERGED_ENV}"
      echo "Production environment is unchanged; keeping the existing .env file."
    else
      mv "${MERGED_ENV}" "${KEEP_DIR}/.env"
      chmod 600 "${KEEP_DIR}/.env"
      ENV_CHANGED=1
      echo "Updated changed values from the packaged .env; server-only values were preserved."
    fi
  else
    cp -a "${PACKAGED_ENV}" "${KEEP_DIR}/.env"
    chmod 600 "${KEEP_DIR}/.env"
    ENV_CHANGED=1
    echo "Installed the packaged production environment for first deployment."
  fi
fi

configure_environment() {
  if [[ ! -t 0 ]]; then
    echo "Production settings require an interactive terminal." >&2
    exit 1
  fi
  echo "Enter production settings; hidden input is not written to shell history."
  read -r -p "AMap Web JS key: " AMAP_INPUT
  read -r -s -p "AMap security code: " AMAP_SECURITY_INPUT
  echo
  read -r -s -p "Yandex Maps API key: " YANDEX_INPUT
  echo
  read -r -p "CWA API key (optional): " CWA_INPUT
  read -r -p "Public HTTPS origin [https://www.cnquake.xyz]: " ORIGIN_INPUT
  ORIGIN_INPUT="${ORIGIN_INPUT:-https://www.cnquake.xyz}"
  read -r -s -p "Debug password: " DEBUG_PASSWORD_INPUT
  echo
  NEXT_ENV="${KEEP_DIR}/.env.next"
  if [[ -f "${KEEP_DIR}/.env" ]]; then
    grep -Ev '^(AMAP_JS_KEY|AMAP_API_KEY|AMAP_KEY|AMAP_TOKEN|GAODE_MAPS_API_KEY|AMAP_SECURITY_JSCODE|AMAP_JSCODE|GAODE_SECURITY_JSCODE|PUBLIC_ORIGIN|CWA_API_KEY|YANDEX_MAPS_API_KEY|YANDEX_MAPS_JS_KEY|YANDEX_DAILY_LIMIT|DEBUG_PASSWORD|VAPID_SUBJECT)=' "${KEEP_DIR}/.env" > "${NEXT_ENV}" || true
  else
    : > "${NEXT_ENV}"
  fi
  {
    if [[ -s "${NEXT_ENV}" ]]; then printf '\n'; fi
    printf 'AMAP_JS_KEY=%s\n' "${AMAP_INPUT}"
    printf 'AMAP_SECURITY_JSCODE=%s\n' "${AMAP_SECURITY_INPUT}"
    printf 'PUBLIC_ORIGIN=%s\n' "${ORIGIN_INPUT}"
    printf 'CWA_API_KEY=%s\n' "${CWA_INPUT}"
    printf 'YANDEX_MAPS_API_KEY=%s\n' "${YANDEX_INPUT}"
    printf 'YANDEX_DAILY_LIMIT=100\n'
    printf 'DEBUG_PASSWORD=%s\n' "${DEBUG_PASSWORD_INPUT}"
    printf 'VAPID_SUBJECT=%s\n' "${ORIGIN_INPUT}"
  } >> "${NEXT_ENV}"
  mv "${NEXT_ENV}" "${KEEP_DIR}/.env"
  chmod 600 "${KEEP_DIR}/.env"
  ENV_CHANGED=1
  if [[ -d "${KEEP_DIR}/data" ]]; then
    rm -f -- "${KEEP_DIR}/data/debug-password.json"
  fi
}

if [[ ! -f "${KEEP_DIR}/.env" ]]; then
  configure_environment
elif [[ "${RECONFIGURE}" == "1" && ! -f "${PACKAGED_ENV}" ]]; then
  configure_environment
fi

cp -a "${KEEP_DIR}/.env" "${PACKAGE_ROOT}/.env"
if [[ -d "${KEEP_DIR}/data" ]]; then
  rm -rf -- "${PACKAGE_ROOT}/data"
  cp -a "${KEEP_DIR}/data" "${PACKAGE_ROOT}/data"
fi

(
  cd "${PACKAGE_ROOT}"
  export NODE_OPTIONS="--max-old-space-size=${DEPLOY_NODE_HEAP_MB} --dns-result-order=ipv4first"
  export npm_config_jobs=1
  export npm_config_audit=false
  export npm_config_fund=false
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund
  npm run check
  npm run config-check
  npm run feature-check
  if grep -Eq '^[[:space:]]*PUSH_RELAY_URL[[:space:]]*=[[:space:]]*[^[:space:]#]+' .env; then
    if ! push_network_preflight; then
      if [[ "${REQUIRE_PUSH_READY}" == "1" ]]; then
        echo "Push relay preflight failed and REQUIRE_PUSH_READY=1; deployment stopped before touching the live service." >&2
        exit 1
      fi
      echo "WARNING: Push relay preflight failed after 3 attempts; continuing deployment because REQUIRE_PUSH_READY=0." >&2
    fi
  fi
)

NODE_BIN="$(command -v node)"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
DROPIN_DIR="/etc/systemd/system/${SERVICE_NAME}.service.d"
SERVICE_EXISTS=0

prepare_safe_service_stop() {
  local effective_exec_stop effective_exec_stop_post effective_restart effective_success_action effective_failure_action
  if ! systemctl cat "${SERVICE_NAME}" >/dev/null 2>&1; then return; fi
  SERVICE_EXISTS=1
  mkdir -p "${SAFE_STOP_DIR}"
  cat > "${SAFE_STOP_FILE}" <<'UNIT'
[Unit]
OnSuccess=
OnFailure=
PropagatesStopTo=
SuccessAction=none
FailureAction=none
JobTimeoutAction=none
StartLimitAction=none

[Service]
Restart=no
ExecStop=
ExecStopPost=
TimeoutStopSec=15s
UNIT
  chmod 600 "${SAFE_STOP_FILE}"
  SAFE_STOP_ACTIVE=1
  systemctl daemon-reload

  effective_exec_stop="$(systemctl show "${SERVICE_NAME}" -p ExecStop --value)"
  effective_exec_stop_post="$(systemctl show "${SERVICE_NAME}" -p ExecStopPost --value)"
  effective_restart="$(systemctl show "${SERVICE_NAME}" -p Restart --value)"
  effective_success_action="$(systemctl show "${SERVICE_NAME}" -p SuccessAction --value)"
  effective_failure_action="$(systemctl show "${SERVICE_NAME}" -p FailureAction --value)"
  if [[ -n "${effective_exec_stop}" || -n "${effective_exec_stop_post}" || "${effective_restart}" != "no" || "${effective_success_action}" != "none" || "${effective_failure_action}" != "none" ]]; then
    echo "Refusing to stop ${SERVICE_NAME}: the temporary systemd safety override did not take effect." >&2
    systemctl show "${SERVICE_NAME}" -p FragmentPath -p DropInPaths -p ExecStop -p ExecStopPost -p Restart -p SuccessAction -p FailureAction --no-pager >&2 || true
    exit 1
  fi
  echo "Verified safe systemd stop profile for ${SERVICE_NAME}; legacy stop hooks and unit actions are disabled."
}

prepare_safe_service_stop
if [[ "${SERVICE_EXISTS}" == "1" ]]; then
  systemctl stop "${SERVICE_NAME}"
fi
if command -v ss >/dev/null 2>&1; then
  PORT_LISTENER="$(ss -H -lntp "sport = :${PORT}" 2>/dev/null || true)"
  if [[ -n "${PORT_LISTENER}" ]]; then
    echo "Port ${PORT} is still occupied after stopping ${SERVICE_NAME}; refusing to mistake an old process for the new deployment." >&2
    printf '%s\n' "${PORT_LISTENER}" >&2
    exit 1
  fi
fi
find "${APP_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
cp -a "${PACKAGE_ROOT}/." "${APP_DIR}/"
mkdir -p "${APP_DIR}/data"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"
if [[ -f "${APP_DIR}/.env" ]]; then chmod 600 "${APP_DIR}/.env"; fi
chmod 700 "${APP_DIR}/data"

cd "${APP_DIR}"
if [[ -L "${UNIT_PATH}" ]]; then
  rm -f -- "${UNIT_PATH}"
  echo "Removed stale systemd unit symlink for ${SERVICE_NAME}."
fi
if [[ -d "${DROPIN_DIR}" ]]; then
  rm -rf -- "${DROPIN_DIR}"
  echo "Removed stale systemd drop-ins for ${SERVICE_NAME}."
fi
cat > "${UNIT_PATH}" <<UNIT
[Unit]
Description=China Earthquake Monitoring Screen
After=network-online.target
Wants=network-online.target
OnSuccess=
OnFailure=
SuccessAction=none
FailureAction=none

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment="NODE_OPTIONS=--dns-result-order=ipv4first"
EnvironmentFile=-${APP_DIR}/.env
ExecStart=/usr/bin/env PORT=${PORT} HOST=127.0.0.1 ${NODE_BIN} server.js
Restart=always
RestartSec=3
TimeoutStopSec=15
KillSignal=SIGTERM
UMask=0077
NoNewPrivileges=true
PrivateDevices=true
ProtectSystem=full
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
UNIT

remove_safe_stop_override
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

health_matches() {
  node -e 'try { const data = JSON.parse(process.argv[2]); process.exit(data.ok === true && data.version === process.argv[1] ? 0 : 1); } catch (_error) { process.exit(1); }' "${EXPECTED_ASSET_VERSION}" "$1"
}

LOCAL_HEALTHY=0
for _ in {1..20}; do
  HEALTH_BODY="$(curl -fsS "http://127.0.0.1:${PORT}/health" 2>/dev/null || true)"
  if systemctl is-active --quiet "${SERVICE_NAME}" && health_matches "${HEALTH_BODY}" && curl -fsS "http://127.0.0.1:${PORT}/sources" >/dev/null; then
    LOCAL_HEALTHY=1
    break
  fi
  sleep 1
done

if [[ "${LOCAL_HEALTHY}" != "1" ]]; then
  systemctl --no-pager --full status "${SERVICE_NAME}" || true
  journalctl -u "${SERVICE_NAME}" -n 80 --no-pager || true
  echo "Service did not start with expected version ${EXPECTED_ASSET_VERSION}." >&2
  exit 1
fi

push_status_matches() {
  node -e '
    const fs = require("fs");
    const envText = fs.readFileSync(process.argv[1], "utf8");
    const value = key => {
      const match = envText.match(new RegExp("^\\s*" + key + "\\s*=\\s*(.*)\\s*$", "m"));
      if (!match) return "";
      const raw = match[1].trim();
      const doubleQuote = String.fromCharCode(34);
      const singleQuote = String.fromCharCode(39);
      return raw.length >= 2 && ((raw[0] === doubleQuote && raw.at(-1) === doubleQuote) || (raw[0] === singleQuote && raw.at(-1) === singleQuote))
        ? raw.slice(1, -1)
        : raw;
    };
    let status;
    try { status = JSON.parse(process.argv[2]); } catch (_error) { process.exit(1); }
    if (!status || status.ok !== true || status.supported !== true) process.exit(1);
    const relayUrl = value("PUSH_RELAY_URL");
    if (!relayUrl) process.exit(0);
    let expectedHost;
    try { expectedHost = new URL(relayUrl).hostname; } catch (_error) { process.exit(1); }
    const transport = status.transport || {};
    const probe = transport.relayProbe || {};
    process.exit(transport.mode === "relay" && transport.relayHost === expectedHost && probe.ok === true && probe.authenticated === true ? 0 : 1);
  ' "${APP_DIR}/.env" "$1"
}

PUSH_READY=0
for _ in {1..30}; do
  PUSH_STATUS_BODY="$(curl -fsS -H 'X-Forwarded-Proto: https' "http://127.0.0.1:${PORT}/push/status" 2>/dev/null || true)"
  if push_status_matches "${PUSH_STATUS_BODY}"; then
    PUSH_READY=1
    break
  fi
  sleep 1
done
if [[ "${PUSH_READY}" != "1" ]]; then
  printf 'Push status: %s\n' "${PUSH_STATUS_BODY:-unavailable}" >&2
  journalctl -u "${SERVICE_NAME}" -n 80 --no-pager || true
  if [[ "${REQUIRE_PUSH_READY}" == "1" ]]; then
    echo "Push runtime configuration did not match ${APP_DIR}/.env or the relay signature probe failed; REQUIRE_PUSH_READY=1." >&2
    exit 1
  fi
  echo "WARNING: The site is running with the new release, but the push relay is not ready yet. The server will retry automatically." >&2
else
  echo "Push runtime configuration and relay signature probe passed."
fi

APP_REAL_DIR="$(readlink -f "${APP_DIR}")"
SERVICE_MAIN_PID="$(systemctl show "${SERVICE_NAME}" -p MainPID --value)"
SERVICE_WORKING_DIR="$(systemctl show "${SERVICE_NAME}" -p WorkingDirectory --value)"
SERVICE_PROCESS_CWD=""
if [[ "${SERVICE_MAIN_PID}" =~ ^[1-9][0-9]*$ && -e "/proc/${SERVICE_MAIN_PID}/cwd" ]]; then
  SERVICE_PROCESS_CWD="$(readlink -f "/proc/${SERVICE_MAIN_PID}/cwd")"
fi
if [[ "${SERVICE_WORKING_DIR}" != "${APP_REAL_DIR}" || "${SERVICE_PROCESS_CWD}" != "${APP_REAL_DIR}" ]]; then
  systemctl --no-pager --full status "${SERVICE_NAME}" || true
  systemctl --no-pager cat "${SERVICE_NAME}" || true
  echo "Service path mismatch: unit=${SERVICE_WORKING_DIR:-unknown}, process=${SERVICE_PROCESS_CWD:-unknown}, expected=${APP_REAL_DIR}." >&2
  exit 1
fi
echo "Verified ${SERVICE_NAME} PID ${SERVICE_MAIN_PID} is running from ${SERVICE_PROCESS_CWD}."

if [[ -n "${PUBLIC_HEALTH_URL}" ]]; then
  PUBLIC_HEALTHY=0
  for _ in {1..10}; do
    HEALTH_BODY="$(curl -fsS -H 'Cache-Control: no-cache' "${PUBLIC_HEALTH_URL}" 2>/dev/null || true)"
    if health_matches "${HEALTH_BODY}"; then
      PUBLIC_HEALTHY=1
      break
    fi
    sleep 2
  done
  if [[ "${PUBLIC_HEALTHY}" != "1" ]]; then
    echo "Public route ${PUBLIC_HEALTH_URL} does not expose expected version ${EXPECTED_ASSET_VERSION}; check the Cloudflare Tunnel route." >&2
    exit 1
  fi
  PUBLIC_SITE_URL="${PUBLIC_HEALTH_URL%/health}"
  (cd "${APP_DIR}" && node scripts/live-release-check.js "${PUBLIC_SITE_URL}")
fi

systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,12p'
echo "Deployment completed on 127.0.0.1:${PORT} with version ${EXPECTED_ASSET_VERSION} (${DEPLOY_SCRIPT_REVISION})."
