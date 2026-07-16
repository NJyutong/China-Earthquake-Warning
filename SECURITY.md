# Security Policy / 安全政策

## 中文

### 报告安全问题

请优先使用 GitHub Private Vulnerability Reporting。不要在公开 Issue 中提交未修复漏洞、真实密钥、推送端点、用户定位、日志或可直接复现的攻击凭证。

报告中请包含受影响版本、影响范围、最小复现步骤和建议缓解措施；所有敏感样本都应脱敏。

### 密钥与凭证

- 真实配置只允许放在服务器 `.env`、平台 Secret 或专用密钥管理服务中。
- `.env.example` 只能包含空值、保留域名和安全占位符。
- 地图、CWA、VAPID、Cloudflare、代理和中继凭证应按最小权限配置，并启用域名/IP/API 限制。
- 一旦密钥出现在提交、构建产物、日志、备份或公开渠道中，应立即撤销并重新生成；仅从 Git 中删除文件不能恢复安全性。
- 不要提交私钥、证书、Cookie、会话、数据库文件或 `data/` 运行内容。

### 生产部署基线

- 对公网使用 HTTPS，并只允许可信反向代理访问 Node 监听端口。
- 仅在代理确实覆盖所有入口时设置 `TRUST_PROXY` 或 `TRUST_GEO_HEADERS`。
- 为 `.env` 和 `data/` 使用最小文件权限，限制备份访问并设置保留期。
- 运行 `npm ci`、`npm run check`、`npm run config-check` 与适用的冒烟检查。
- 供应商或 npm 依赖出现安全公告时及时升级并重新验证。

本项目不承诺作为官方地震应急预警系统使用。

## English

### Reporting a vulnerability

Please use GitHub Private Vulnerability Reporting first. Do not submit unpatched vulnerabilities, live credentials, push endpoints, user locations, logs, or directly usable attack credentials in public Issues.

Include the affected version, scope of impact, minimal reproduction steps, and recommended mitigations. All sensitive samples must be redacted.

### Secrets and credentials

- Keep live configuration only in the server `.env`, platform secrets, or a dedicated secret manager.
- `.env.example` may contain only empty values, reserved domains, and safe placeholders.
- Scope map, CWA, VAPID, Cloudflare, proxy, and relay credentials to the minimum permissions and available domain/IP/API restrictions.
- Revoke and rotate any credential that appears in a commit, build artifact, log, backup, or public channel. Deleting the file from Git is not sufficient remediation.
- Never commit private keys, certificates, cookies, sessions, databases, or runtime `data/` files.

### Production baseline

- Use HTTPS and expose the Node listener only to a trusted reverse proxy.
- Set `TRUST_PROXY` or `TRUST_GEO_HEADERS` only when that proxy controls every ingress path.
- Apply least-privilege permissions and retention policies to `.env`, `data/`, and backups.
- Run `npm ci`, `npm run check`, `npm run config-check`, and applicable smoke checks.
- Upgrade and retest when providers or npm dependencies publish security advisories.

This project is not warranted as an official earthquake emergency-warning system.
