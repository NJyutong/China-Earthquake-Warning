const http = require('http');
const WebSocket = require('ws');
const { assetVersion } = require('./version');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const publicOrigin = process.env.PUBLIC_ORIGIN || 'https://www.cnquake.xyz';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(response) {
  return response.json().catch(() => ({}));
}

function rawResponse(path, headers = {}, method = 'GET') {
  const target = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path,
      method,
      headers
    }, response => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers }));
    });
    request.on('error', reject);
    request.end();
  });
}

function rawRequest(path, headers) {
  return rawResponse(path, headers).then(response => response.status);
}

function websocketHello(origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(baseUrl.replace(/^http/, 'ws') + '/ws', { origin });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('WebSocket hello 超时'));
    }, 5000);
    socket.once('message', data => {
      clearTimeout(timer);
      const payload = JSON.parse(String(data));
      socket.close();
      resolve(payload);
    });
    socket.once('error', reject);
  });
}

function websocketRejected(origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(baseUrl.replace(/^http/, 'ws') + '/ws', { origin });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('跨站 WebSocket 未被及时拒绝'));
    }, 5000);
    socket.once('open', () => {
      clearTimeout(timer);
      socket.terminate();
      reject(new Error('跨站 WebSocket 被错误接受'));
    });
    socket.once('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      response.resume();
      resolve(response.statusCode);
    });
    socket.once('error', () => {});
  });
}

function websocketOversizeClosed() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(baseUrl.replace(/^http/, 'ws') + '/ws', { origin: publicOrigin });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('超大 WebSocket 消息未被关闭'));
    }, 5000);
    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'area_filter', padding: 'x'.repeat(20000) }));
    });
    socket.once('close', code => {
      clearTimeout(timer);
      resolve(code);
    });
    socket.once('error', () => {});
  });
}

async function main() {
  const health = await fetch(`${baseUrl}/health`);
  const healthData = await json(health);
  assert(health.status === 200 && healthData.ok && healthData.version === assetVersion, '运行中的服务版本与发布包不一致');
  const page = await fetch(`${baseUrl}/`);
  const html = await page.text();
  assert(page.status === 200, '桌面页面未返回 200');
  assert(page.headers.get('x-earthquake-release') === assetVersion, '桌面页面发布版本响应头不正确');
  assert(html.includes('data-data-state="connecting"'), '桌面页面缺少连接中初始状态');
  assert(!html.includes('四川阿坝州汶川县'), '桌面页面仍包含固定地震样例');
  const csp = page.headers.get('content-security-policy') || '';
  assert(/(?:^|;)\s*default-src\s+'self'/i.test(csp), 'CSP 缺少 default-src');
  assert(/(?:^|;)\s*script-src\s+/i.test(csp), 'CSP 缺少 script-src');
  assert(/(?:^|;)\s*script-src-attr\s+'none'/i.test(csp), 'CSP 未禁止行内事件处理器');
  const nonce = (html.match(/<script nonce="([A-Za-z0-9_-]+)">window\.__QUAKE_BOOTSTRAP__=/) || [])[1];
  assert(nonce && csp.includes(`'nonce-${nonce}'`), '页面引导脚本缺少有效 CSP nonce');
  assert(html.includes('data-language="en"'), '首页缺少英语切换入口');
  assert(html.includes('id="desktop-voice-toggle"'), '桌面页面缺少语音播报开关');

  const versionedAsset = await fetch(`${baseUrl}/app.js?v=${encodeURIComponent(assetVersion)}`);
  assert(versionedAsset.status === 200, '版本化桌面脚本未返回 200');
  assert(/immutable/i.test(versionedAsset.headers.get('cache-control') || ''), '版本化静态资源未启用不可变缓存');
  const unversionedAsset = await fetch(`${baseUrl}/app.js`);
  assert(/no-store/i.test(unversionedAsset.headers.get('cache-control') || ''), '无版本脚本未禁用缓存');

  const publicHttp = await rawResponse('/?desktop=1', {
    host: new URL(publicOrigin).host,
    'x-forwarded-proto': 'http'
  });
  assert(publicHttp.status === 308, '公开域名 HTTP 请求未强制跳转 HTTPS');
  const redirectTarget = new URL(String(publicHttp.headers.location || ''), baseUrl);
  assert(redirectTarget.origin === new URL(publicOrigin).origin && redirectTarget.pathname === '/', 'HTTPS 跳转目标不安全');

  const unsupportedMethod = await rawResponse('/', {}, 'TRACE');
  assert(unsupportedMethod.status === 405, '不受支持的 HTTP 方法未被拒绝');
  const traversal = await fetch(`${baseUrl}/..%2fserver.js`);
  assert([400, 404].includes(traversal.status), '静态文件服务存在路径穿越风险');
  const privateEnv = await fetch(`${baseUrl}/.env`);
  assert([403, 404].includes(privateEnv.status), '服务器错误公开了生产 .env');
  const xssPayload = '<img src=x onerror=globalThis.__xss=1>';
  const injectedPage = await fetch(`${baseUrl}/?desktop=1&lat=39.9&lon=116.4&place=${encodeURIComponent(xssPayload)}`);
  const injectedHtml = await injectedPage.text();
  assert(!injectedHtml.includes(xssPayload), '页面把查询参数未经转义写回 HTML');
  const injectedGeocode = await fetch(`${baseUrl}/geocode?q=${encodeURIComponent(xssPayload)}`);
  assert(/application\/json/i.test(injectedGeocode.headers.get('content-type') || ''), '注入测试接口未保持 JSON 内容类型');
  const oversizedUrl = await rawRequest('/?' + 'q='.repeat(4200));
  assert(oversizedUrl === 414, '超长 URL 未被拒绝');
  const oversizedHeaderResponse = await rawResponse('/', { cookie: 'x'.repeat(40 * 1024) });
  const oversizedHeader = oversizedHeaderResponse.status;
  assert(oversizedHeader === 431, '超大请求头未被拒绝为 431');
  assert(/cookies/i.test(String(oversizedHeaderResponse.headers['clear-site-data'] || '')), '431 响应未发送 Cookie 清理指令');
  const invalidAmapCallback = await rawRequest('/_AMapService/v3/log/init?callback=alert%281%29%2F%2F');
  assert(invalidAmapCallback === 400, '高德地图代理接受了不安全的 JSONP 回调');

  const mobilePage = await fetch(`${baseUrl}/mobile`, {
    headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' }
  });
  const mobileHtml = await mobilePage.text();
  assert(mobilePage.status === 200, '手机页面未返回 200');
  assert(mobileHtml.includes('data-data-state="connecting"'), '手机页面缺少连接中初始状态');
  assert(!mobileHtml.includes('四川阿坝州汶川县'), '手机页面仍包含固定地震样例');
  assert(mobileHtml.includes('id="mobile-voice-toggle"'), '手机页面缺少语音播报开关');
  assert(mobileHtml.includes('id="mobile-notification-toggle"'), '手机页面缺少后台推送开关');
  assert(mobileHtml.includes('id="mobile-notification-settings-panel"'), '手机页面缺少后台推送条件设置');
  assert(mobileHtml.includes(`push-client.js?v=${assetVersion}`), '手机页面未加载当前版本的统一推送客户端');

  const obsPage = await fetch(`${baseUrl}/obs`);
  const obsHtml = await obsPage.text();
  assert(obsPage.status === 200, 'OBS 页面未返回 200');
  assert(obsHtml.includes('data-data-state="connecting"'), 'OBS 页面缺少连接中初始状态');
  assert(obsHtml.includes('等待服务器返回地震数据'), 'OBS 页面在数据返回前仍显示固定空数据');

  const configResponse = await fetch(`${baseUrl}/config`);
  const clientConfig = await json(configResponse);
  assert(configResponse.status === 200, '客户端配置接口异常');
  assert(clientConfig.obsEnabled === true, '服务器未向客户端公开 OBS 已开启状态');
  assert(!Object.prototype.hasOwnProperty.call(clientConfig, 'yandexMapsApiKey'), '普通配置接口泄露 Yandex API Key');
  assert(Number(clientConfig.yandexDailyLimit) <= 100, 'Yandex 每日授权上限超过 100');
  if (clientConfig.yandexConfigured && !clientConfig.yandexQuotaExhausted) {
    assert(clientConfig.yandexMapsAvailable, 'Yandex 地图仍被国家或 IP 条件错误禁用');
  }

  const insecurePush = await fetch(`${baseUrl}/push/public-key`);
  assert(insecurePush.status === 426, 'HTTP 推送接口未拒绝非 HTTPS 请求');

  const securePush = await fetch(`${baseUrl}/push/public-key`, {
    headers: { 'x-forwarded-proto': 'https' }
  });
  const pushStatus = await json(securePush);
  assert(securePush.status === 200 && pushStatus.supported, `VAPID 初始化失败: ${pushStatus.message || securePush.status}`);
  assert(String(pushStatus.publicKey || '').length >= 80, 'VAPID 公钥无效');
  assert(securePush.headers.get('strict-transport-security'), 'HTTPS 响应缺少 HSTS');

  const pushServiceResponse = await fetch(`${baseUrl}/push/status`, {
    headers: { 'x-forwarded-proto': 'https' }
  });
  const pushServiceStatus = await json(pushServiceResponse);
  assert(pushServiceResponse.status === 200 && pushServiceStatus.supported, '后台推送状态接口异常');
  assert(Number.isInteger(pushServiceStatus.subscriptionCount) && pushServiceStatus.subscriptionCount >= 0, '后台推送订阅计数无效');
  assert(!Object.prototype.hasOwnProperty.call(pushServiceStatus, 'subscriptions'), '后台推送状态接口泄露订阅端点');

  const invalidPushTestStatus = await fetch(`${baseUrl}/push/test-status?id=invalid`, {
    headers: { 'x-forwarded-proto': 'https' }
  });
  assert(invalidPushTestStatus.status === 400, '通知测试结果接口接受了无效编号');

  const invalidPushAck = await fetch(`${baseUrl}/push/test-ack`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-proto': 'https',
      origin: publicOrigin
    },
    body: JSON.stringify({ testId: 'invalid', endpoint: 'https://example.invalid' })
  });
  assert(invalidPushAck.status === 400, '设备通知回执接口接受了无效编号或端点');

  const invalidResubscribe = await fetch(`${baseUrl}/push/resubscribe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-proto': 'https',
      origin: publicOrigin
    },
    body: JSON.stringify({ subscription: { endpoint: 'https://example.invalid' } })
  });
  assert(invalidResubscribe.status === 400, '后台推送续订接口接受了无效订阅');

  const malformedSubscription = await fetch(`${baseUrl}/push/subscribe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-proto': 'https',
      origin: publicOrigin
    },
    body: JSON.stringify({
      subscription: {
        endpoint: 'https://localhost/push',
        keys: { p256dh: 'x', auth: 'x' }
      }
    })
  });
  assert(malformedSubscription.status === 400, '服务端接受了无效推送订阅');

  const disallowedPushHost = await fetch(`${baseUrl}/push/subscribe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-proto': 'https',
      origin: publicOrigin
    },
    body: JSON.stringify({
      subscription: {
        endpoint: 'https://example.com/push/ssrf-check',
        keys: { p256dh: 'A'.repeat(32), auth: 'B'.repeat(8) }
      }
    })
  });
  assert(disallowedPushHost.status === 400, '服务端接受了非浏览器厂商推送目标');

  const smokeEndpoint = `https://fcm.googleapis.com/wp/smoke-${Date.now()}`;
  const smokeSubscription = {
    endpoint: smokeEndpoint,
    keys: { p256dh: 'A'.repeat(32), auth: 'B'.repeat(8) }
  };
  const smokeSubscribe = await fetch(`${baseUrl}/push/subscribe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-proto': 'https',
      origin: publicOrigin
    },
    body: JSON.stringify({ subscription: smokeSubscription, threshold: 3 })
  });
  assert(smokeSubscribe.status === 200, '通知测试冒烟订阅注册失败');
  const pushTestStartedAt = Date.now();
  const smokePushTest = await fetch(`${baseUrl}/push/test`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-proto': 'https',
      origin: publicOrigin
    },
    body: JSON.stringify({
      endpoint: smokeEndpoint,
      event: {
        eventKey: `push-smoke-${Date.now()}`,
        location: '通知测试',
        magnitude: 4,
        depth: 10,
        latitude: 30,
        longitude: 104,
        originTime: new Date().toISOString()
      }
    })
  });
  const smokePushAccepted = await json(smokePushTest);
  assert(smokePushTest.status === 202 && smokePushAccepted.accepted && smokePushAccepted.testId, '通知测试未快速受理');
  assert(Date.now() - pushTestStartedAt < 3000, '通知测试 POST 仍被外部推送发送阻塞');
  let smokePushResult = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${baseUrl}/push/test-status?id=${encodeURIComponent(smokePushAccepted.testId)}`, {
      headers: { 'x-forwarded-proto': 'https' }
    });
    smokePushResult = await json(response);
    if (smokePushResult.completed) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(smokePushResult && smokePushResult.completed, '通知测试后台结果未完成');
  assert(!Object.prototype.hasOwnProperty.call(smokePushResult, 'endpoint'), '通知测试结果泄露推送端点');
  assert(!Object.prototype.hasOwnProperty.call(smokePushResult, 'endpointHash'), '通知测试结果泄露推送端点摘要');
  await fetch(`${baseUrl}/push/unsubscribe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-proto': 'https',
      origin: publicOrigin
    },
    body: JSON.stringify({ endpoint: smokeEndpoint })
  });

  const crossOrigin = await fetch(`${baseUrl}/debug/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://attacker.invalid' },
    body: JSON.stringify({ password: 'invalid' })
  });
  assert(crossOrigin.status === 403, '跨站 POST 未被拒绝');

  const crossSiteWithoutOrigin = await fetch(`${baseUrl}/debug/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
    body: JSON.stringify({ password: 'invalid' })
  });
  assert(crossSiteWithoutOrigin.status === 403, '缺少 Origin 的跨站 Fetch Metadata 请求未被拒绝');

  const mixedSchemeOrigin = await fetch(`${baseUrl}/debug/verify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-proto': 'https',
      origin: baseUrl
    },
    body: JSON.stringify({ password: 'invalid' })
  });
  assert(mixedSchemeOrigin.status === 403, 'HTTPS 接口接受了 HTTP Origin');

  const wrongPassword = await fetch(`${baseUrl}/debug/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: publicOrigin },
    body: JSON.stringify({ password: 'definitely-wrong' })
  });
  assert(wrongPassword.status === 401, '错误调试密码未返回 401');

  let limitedStatus = 0;
  for (let index = 0; index < 9; index += 1) {
    const limited = await fetch(`${baseUrl}/debug/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: publicOrigin,
        'x-forwarded-for': '203.0.113.77'
      },
      body: JSON.stringify({ password: 'rate-limit-test' })
    });
    limitedStatus = limited.status;
  }
  assert(limitedStatus === 429, '调试接口未按 IP 启用请求频率限制');

  const malformedJson = await fetch(`${baseUrl}/debug/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: publicOrigin },
    body: '{bad json'
  });
  assert(malformedJson.status === 400, '畸形 JSON 未被拒绝');

  const oversizedJson = await fetch(`${baseUrl}/arrival`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: publicOrigin },
    body: JSON.stringify({ padding: 'x'.repeat(70 * 1024) })
  });
  assert(oversizedJson.status === 413, '超大 JSON 未被拒绝');

  const proxyEscape = await rawRequest('/_AMapService//attacker.invalid/test');
  assert(proxyEscape === 400, '高德代理路径可逃逸到外部主机');

  const history = await fetch(`${baseUrl}/history?country=CN_MAINLAND&region=all&limit=1`);
  const historyData = await json(history);
  assert(history.status === 200 && Array.isArray(historyData.events), '历史接口异常');

  const hello = await websocketHello(publicOrigin);
  assert(hello.type === 'hello', '同源 WebSocket 未返回 hello');
  const rejectedStatus = await websocketRejected('https://attacker.invalid');
  assert(rejectedStatus >= 400, '跨站 WebSocket 未被拒绝');
  const oversizeCloseCode = await websocketOversizeClosed();
  assert(oversizeCloseCode === 1009 || oversizeCloseCode === 1006, '超大 WebSocket 消息关闭码异常');

  console.log('Security smoke checks passed.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
