const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const relayPath = path.join(__dirname, '..', 'cloudflare', 'push-relay-worker.mjs');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const networkCheckSource = fs.readFileSync(path.join(__dirname, 'push-network-check.js'), 'utf8');
const secret = 'relay-smoke-secret-'.padEnd(64, 'a');

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  assert(serverSource.includes("dns.setDefaultResultOrder(DNS_RESULT_ORDER)"), 'Node 服务未固定出站 DNS 地址顺序');
  assert(serverSource.includes('requestPushRelay(PUSH_TRANSPORT.relayUrl'), '实际推送未使用受控中继 HTTPS 客户端');
  assert(serverSource.includes('agent: pushHttpsAgent'), '中继 HTTPS 客户端未使用公网 DNS 过滤代理');
  assert(serverSource.includes('startPushRelayRecoveryMonitor()'), '中继失败后未安排自动恢复检查');
  assert(networkCheckSource.includes('https.request(target'), '部署前中继检查未使用受控 HTTPS 客户端');
  assert(!networkCheckSource.includes('await fetch('), '部署前中继检查仍依赖全局 fetch');
  const { default: worker } = await import(pathToFileURL(relayPath).href);
  const env = { PUSH_RELAY_SECRET: secret };

  const health = await worker.fetch(new Request('https://relay.example/health'), env);
  assert.strictEqual(health.status, 200, '推送中继健康接口异常');
  const healthData = await health.json();
  assert.strictEqual(healthData.ok, true, '推送中继健康接口内容异常');
  assert.match(healthData.version, /^r[0-9A-Za-z._-]+$/, '推送中继健康接口缺少版本');

  const unauthorized = await worker.fetch(new Request('https://relay.example/', { method: 'POST', body: '{}' }), env);
  assert.strictEqual(unauthorized.status, 401, '推送中继接受了未签名请求');

  const stale = await signedRequest(worker, env, {
    endpoint: 'https://fcm.googleapis.com/wp/stale',
    headers: validHeaders(),
    body: Buffer.from('test').toString('base64')
  }, Math.floor(Date.now() / 1000) - 120);
  assert.strictEqual(stale.status, 401, '推送中继接受了过期签名');

  const disallowed = await signedRequest(worker, env, {
    endpoint: 'https://example.com/push',
    headers: validHeaders(),
    body: Buffer.from('test').toString('base64')
  });
  assert.strictEqual(disallowed.status, 403, '推送中继接受了非浏览器厂商目标');

  const invalidHeaders = await signedRequest(worker, env, {
    endpoint: 'https://fcm.googleapis.com/wp/header-check',
    headers: { TTL: 60 },
    body: Buffer.from('test').toString('base64')
  });
  assert.strictEqual(invalidHeaders.status, 400, '推送中继接受了缺少鉴权的转发头');

  const diagnostics = await signedRequest(worker, env, { probe: true }, undefined, '/diagnostics');
  const diagnosticsData = await diagnostics.json();
  assert.strictEqual(diagnostics.status, 200, '推送中继签名诊断接口异常');
  assert.strictEqual(diagnosticsData.authenticated, true, '推送中继签名诊断未验证共享密钥');
  assert.match(diagnosticsData.requestId, /^[0-9a-f-]{36}$/i, '推送中继诊断缺少请求编号');

  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  try {
    global.fetch = async () => new Response('', { status: 201 });
    const accepted = await signedRequest(worker, env, {
      endpoint: 'https://fcm.googleapis.com/wp/provider-accepted',
      headers: validHeaders(),
      body: Buffer.from('test').toString('base64')
    });
    const acceptedData = await accepted.json();
    assert.strictEqual(accepted.status, 200, '推送中继未返回厂商接受结果');
    assert.strictEqual(acceptedData.ok, true, '推送中继错误标记厂商接受结果');
    assert.strictEqual(acceptedData.status, 201, '推送中继丢失厂商 HTTP 状态');
    assert.strictEqual(acceptedData.provider, 'fcm', '推送中继厂商分类错误');

    global.fetch = async () => {
      const error = new Error('simulated provider network failure');
      error.code = 'ETIMEDOUT';
      throw error;
    };
    console.error = () => {};
    const failed = await signedRequest(worker, env, {
      endpoint: 'https://db5.notify.windows.com/w/?token=smoke',
      headers: validHeaders(),
      body: Buffer.from('test').toString('base64')
    });
    const failedData = await failed.json();
    assert.strictEqual(failed.status, 502, '推送中继未区分厂商网络失败');
    assert.strictEqual(failedData.code, 'provider_connection_failed', '推送中继厂商网络错误码不明确');
    assert.strictEqual(failedData.provider, 'wns', '推送中继厂商网络失败分类错误');
    assert.match(failedData.requestId, /^[0-9a-f-]{36}$/i, '推送中继厂商失败缺少诊断编号');
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  }

  console.log(JSON.stringify({ ok: true, checks: 13 }));
}

function validHeaders() {
  return {
    TTL: 60,
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    Authorization: 'vapid t=test, k=test'
  };
}

function signedRequest(worker, env, payload, timestampValue = Math.floor(Date.now() / 1000), pathname = '/') {
  const body = JSON.stringify(payload);
  const timestamp = String(timestampValue);
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return worker.fetch(new Request(`https://relay.example${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cnquake-Timestamp': timestamp,
      'X-Cnquake-Signature': signature
    },
    body
  }), env);
}
