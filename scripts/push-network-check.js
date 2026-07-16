const dns = require('dns');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const tls = require('tls');

const root = path.resolve(__dirname, '..');
loadEnv(path.join(root, '.env'));
const DNS_RESULT_ORDER = String(process.env.DNS_RESULT_ORDER || '').trim().toLowerCase() === 'verbatim' ? 'verbatim' : 'ipv4first';
dns.setDefaultResultOrder(DNS_RESULT_ORDER);
const relayHttpsAgent = createRelayHttpsAgent();

const relayUrl = String(process.env.PUSH_RELAY_URL || '').trim();
const proxyUrl = String(
  process.env.PUSH_PROXY_URL || process.env.HTTPS_PROXY || process.env.https_proxy || ''
).trim();

main().catch(error => {
  console.error(`推送网络检查失败：${describeError(error)}`);
  process.exitCode = 1;
});

function describeError(error) {
  const details = [];
  const append = value => {
    if (!value) return;
    const code = String(value.code || '').trim();
    const message = String(value.message || value).trim();
    const detail = code && !message.includes(code) ? `${message} [${code}]` : message;
    if (detail && !details.includes(detail)) details.push(detail);
  };
  append(error);
  append(error && error.cause);
  if (error && Array.isArray(error.errors)) error.errors.slice(0, 4).forEach(append);
  return details.join('；') || '未知错误';
}

async function main() {
  if (relayUrl) {
    await checkRelay(relayUrl);
    return;
  }

  const hosts = subscriptionHosts(path.join(root, 'data', 'push-subscriptions.json'));
  if (!hosts.length) {
    console.log('没有已保存的浏览器推送订阅。请先在网页中开启后台推送，再运行本检查。');
    return;
  }

  console.log(`推送传输模式：${proxyUrl ? `HTTPS CONNECT 代理 ${safeProxyLabel(proxyUrl)}` : '服务器直接出站'}`);
  let failed = false;
  for (const hostname of hosts) {
    const provider = pushProvider(hostname);
    const result = proxyUrl
      ? await checkThroughProxy(hostname, proxyUrl)
      : await checkDirect(hostname);
    console.log(`${provider} ${hostname}:443 ${result.ok ? '可连接' : '连接失败'}${result.detail ? `（${result.detail}）` : ''}`);
    if (!result.ok) failed = true;
  }
  if (failed) process.exitCode = 2;
}

async function checkRelay(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    throw new Error('PUSH_RELAY_URL 不是有效 URL');
  }
  if (url.protocol !== 'https:') throw new Error('PUSH_RELAY_URL 必须使用 HTTPS');
  const relaySecret = String(process.env.PUSH_RELAY_SECRET || '').trim();
  if (relaySecret.length < 32 || relaySecret.length > 256) throw new Error('PUSH_RELAY_SECRET 必须为 32 至 256 位');
  const healthUrl = new URL('/health', url);
  const response = await requestRelayJson(healthUrl, { expectedOrigin: url.origin });
  const data = response.data;
  if (!response.ok || !data.ok) throw new Error(`中继健康接口返回 HTTP ${response.status}`);

  const probeBody = JSON.stringify({ probe: true });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', relaySecret).update(`${timestamp}.${probeBody}`).digest('hex');
  const probeResponse = await requestRelayJson(new URL('/diagnostics', url), {
    expectedOrigin: url.origin,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cnquake-Timestamp': timestamp,
      'X-Cnquake-Signature': signature
    },
    body: probeBody
  });
  const probe = probeResponse.data;
  if (!probeResponse.ok || !probe.ok || probe.authenticated !== true) {
    throw new Error(`中继签名校验失败（HTTP ${probeResponse.status}，${probe.code || 'unknown'}）`);
  }
  console.log(`推送传输模式：Cloudflare Worker 中继 ${url.hostname}`);
  console.log(`中继健康接口：可连接${data.version ? `（${data.version}）` : ''}`);
  console.log(`中继签名校验：通过${probe.version ? `（${probe.version}）` : ''}`);
}

function createRelayHttpsAgent() {
  return new https.Agent({
    keepAlive: true,
    maxSockets: 4,
    minVersion: 'TLSv1.2',
    lookup(hostname, options, callback) {
      dns.lookup(hostname, {
        family: options && options.family || 0,
        hints: options && options.hints || 0,
        all: true
      }, (error, addresses) => {
        if (error) {
          callback(error);
          return;
        }
        const publicAddresses = (addresses || [])
          .filter(item => isPublicAddress(item.address))
          .sort((left, right) => addressFamilyPriority(left.family) - addressFamilyPriority(right.family));
        if (!publicAddresses.length) {
          const lookupError = new Error('中继 DNS 未返回公网地址');
          lookupError.code = 'ENETUNREACH';
          callback(lookupError);
          return;
        }
        if (options && options.all) callback(null, publicAddresses);
        else callback(null, publicAddresses[0].address, publicAddresses[0].family);
      });
    }
  });
}

function addressFamilyPriority(family) {
  if (DNS_RESULT_ORDER === 'ipv4first') return Number(family) === 4 ? 0 : 1;
  return 0;
}

function requestRelayJson(value, options = {}) {
  const target = value instanceof URL ? new URL(value.href) : new URL(String(value));
  if (target.protocol !== 'https:' || target.origin !== options.expectedOrigin) {
    return Promise.reject(new Error('中继检查地址与 PUSH_RELAY_URL 来源不一致'));
  }
  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body == null ? '' : String(options.body);
  const headers = { Accept: 'application/json', 'User-Agent': 'cnquake-push-network-check/1.0', ...(options.headers || {}) };
  if (body) headers['Content-Length'] = Buffer.byteLength(body);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, valueToReturn) => {
      if (settled) return;
      settled = true;
      handler(valueToReturn);
    };
    const request = https.request(target, {
      method,
      headers,
      agent: relayHttpsAgent,
      rejectUnauthorized: true
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 64 * 1024) {
          const responseError = new Error('中继检查响应超过 64 KiB');
          responseError.code = 'ERR_RESPONSE_TOO_LARGE';
          response.destroy(responseError);
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', error => finish(reject, error));
      response.once('end', () => {
        const status = Number(response.statusCode) || 0;
        let data = {};
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
        } catch (_error) {
          // The caller reports the HTTP status for invalid JSON responses.
        }
        finish(resolve, { ok: status >= 200 && status < 300, status, data });
      });
    });
    request.setTimeout(7000, () => {
      const timeoutError = new Error('中继 HTTPS 请求超时（7000ms）');
      timeoutError.code = 'ETIMEDOUT';
      request.destroy(timeoutError);
    });
    request.once('error', error => finish(reject, error));
    request.end(body || undefined);
  });
}

async function checkDirect(hostname) {
  let addresses;
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: false });
  } catch (error) {
    return { ok: false, detail: `DNS ${error.code || error.message}` };
  }
  const publicAddresses = addresses.filter(item => isPublicAddress(item.address)).slice(0, 8);
  if (!publicAddresses.length) return { ok: false, detail: 'DNS 未返回公网地址' };
  const attempts = await Promise.all(publicAddresses.map(item => tlsProbe(hostname, item)));
  const passed = attempts.find(item => item.ok);
  if (passed) return { ok: true, detail: `${passed.address} TLS ${passed.protocol}` };
  return { ok: false, detail: attempts.map(item => `${item.address} ${item.error}`).join('; ') };
}

function tlsProbe(hostname, item) {
  return new Promise(resolve => {
    const socket = tls.connect({
      host: item.address,
      port: 443,
      family: item.family,
      servername: hostname,
      rejectUnauthorized: true,
      timeout: 6000
    });
    const finish = result => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ address: item.address, ...result });
    };
    socket.once('secureConnect', () => finish({ ok: true, protocol: socket.getProtocol() || 'unknown' }));
    socket.once('timeout', () => finish({ ok: false, error: 'ETIMEDOUT' }));
    socket.once('error', error => finish({ ok: false, error: error.code || error.message }));
  });
}

async function checkThroughProxy(hostname, value) {
  let HttpsProxyAgent;
  try {
    ({ HttpsProxyAgent } = require('https-proxy-agent'));
  } catch (_error) {
    return { ok: false, detail: '缺少 https-proxy-agent' };
  }
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let request;
    try {
      request = https.request({
        hostname,
        port: 443,
        path: '/',
        method: 'HEAD',
        agent: new HttpsProxyAgent(value),
        timeout: 7000
      }, response => {
        response.resume();
        finish({ ok: true, detail: `代理握手成功，HTTP ${response.statusCode}` });
      });
    } catch (error) {
      finish({ ok: false, detail: error.code || error.message });
      return;
    }
    request.once('timeout', () => request.destroy(new Error('ETIMEDOUT')));
    request.once('error', error => finish({ ok: false, detail: error.code || error.message }));
    request.end();
  });
}

function subscriptionHosts(filePath) {
  try {
    const records = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const hosts = new Set();
    for (const record of Array.isArray(records) ? records : []) {
      try {
        const hostname = new URL(record && record.subscription && record.subscription.endpoint).hostname.toLowerCase();
        if (hostname) hosts.add(hostname);
      } catch (_error) {
        // Ignore malformed historical records without printing endpoint secrets.
      }
    }
    return Array.from(hosts).sort();
  } catch (_error) {
    return [];
  }
}

function pushProvider(hostname) {
  if (hostname.endsWith('.notify.windows.com') || hostname.endsWith('.wns.windows.com')) return 'Microsoft Edge / WNS';
  if (hostname === 'fcm.googleapis.com' || hostname.endsWith('.fcm.googleapis.com') || hostname === 'android.googleapis.com') return 'Google FCM';
  if (hostname.endsWith('.push.services.mozilla.com')) return 'Mozilla Push';
  if (hostname === 'web.push.apple.com' || hostname.endsWith('.push.apple.com')) return 'Apple Web Push';
  return '浏览器厂商推送服务';
}

function safeProxyLabel(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
  } catch (_error) {
    return '配置无效';
  }
}

function isPublicAddress(value) {
  if (value.includes(':')) {
    const lower = value.toLowerCase();
    return lower !== '::1' && !lower.startsWith('fc') && !lower.startsWith('fd') && !lower.startsWith('fe8') && !lower.startsWith('fe9') && !lower.startsWith('fea') && !lower.startsWith('feb');
  }
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part))) return false;
  if ([0, 10, 127].includes(parts[0]) || parts[0] >= 224) return false;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
  if (parts[0] === 192 && parts[1] === 168) return false;
  if (parts[0] === 169 && parts[1] === 254) return false;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false;
  return true;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
