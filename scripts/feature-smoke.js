const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assetVersion, cacheName } = require('./version');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('server.js');
const index = read('public/index.html');
const mobile = read('public/mobile.html');
const styles = read('public/styles.css');
const mobileStyles = read('public/mobile.css');
const app = read('public/app.js');
const mobileApp = read('public/mobile.js');
const shared = read('public/shared.js');
const officialMap = read('public/official-map.js');
const serviceWorker = read('public/sw.js');
const i18n = read('public/i18n.js');
const secureStorage = read('public/secure-storage.js');
const voiceAlert = read('public/voice-alert.js');
const pushClient = read('public/push-client.js');
const pushWorker = read('public/push-sw.js');
const pushWorkerRuntime = read('public/push-worker-runtime.js');
const pushRelayWorker = read('cloudflare/push-relay-worker.mjs');
const deployScript = read('scripts/deploy-linux.sh');
const packageScript = read('scripts/package-release.js');
const sharedRuntime = require('../public/shared.js');
const { simplifyTaiwanPayload, simplifyTaiwanText } = require('../lib/taiwan-simplifier');

assert(/^[A-Za-z0-9._-]{2,80}$/.test(assetVersion), '发布版本号格式无效');
assert(JSON.parse(read('release.json')).assetVersion === assetVersion, 'release.json 未由 package.json 同步生成');
for (const [name, html] of [['desktop', index], ['mobile', mobile], ['obs', read('public/obs.html')]]) {
  const versions = [...html.matchAll(/(?:i18n|styles|mobile|obs|shared|secure-storage|voice-alert|push-client|official-map|app)\.(?:css|js)\?v=([^"']+)/g)]
    .map(match => match[1]);
  assert(versions.length > 0 && versions.every(version => version === assetVersion), `${name} 资源版本未同步`);
}
assert(serviceWorker.includes(`?v=${assetVersion}`), 'Service Worker 资源版本未同步');
assert(serviceWorker.includes(`CACHE_NAME = '${cacheName}'`), 'Service Worker 缓存版本未与 package.json 同步');
assert(serviceWorker.includes(`/push-client.js?v=${assetVersion}`), 'Service Worker 缺少统一推送客户端资源');
assert(serviceWorker.includes(`importScripts('/push-worker-runtime.js?v=${assetVersion}')`), '主 Service Worker 未加载统一推送运行时');
assert(pushWorker.includes(`importScripts('/push-worker-runtime.js?v=${assetVersion}')`), '兼容 Service Worker 未加载统一推送运行时');
assert(pushWorkerRuntime.includes(`const PUSH_WORKER_VERSION = '${assetVersion}'`), '推送运行时版本未同步');
assert(!serviceWorker.includes("'/mobile',") && !serviceWorker.includes("'/mobile.html',"), 'Service Worker 仍缓存 HTML 页面');
assert(serviceWorker.includes("event.request.mode === 'navigate'") && serviceWorker.includes("cache: 'no-store'"), 'Service Worker 未强制导航请求使用网络');

assert(index.indexOf('class="map-metrics"') > index.indexOf('class="map-stage"'), '桌面地图浮动指标不在地图层内');
assert(index.includes('id="desktop-map-coords"') && index.includes('id="desktop-map-radius"'), '桌面地图缺少震源坐标或传播半径');
assert(index.includes('id="desktop-detail-coords"') && index.includes('id="desktop-detail-radius"'), '窄地图缺少地震详情指标回退字段');
assert(/\.map-stage > \.map-metrics\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*16px;[\s\S]*?left:\s*50%;[\s\S]*?translateX\(-50%\)/.test(styles), '桌面地图指标未固定在统一顶部安全区');
assert(!/data-map-source="(?:google|yandex)"[^}]*\.map-metrics/.test(styles), '地图指标仍按地图源使用不一致的位置');
assert(app.includes('initMapMetricLayout()') && app.includes("stage.dataset.metricsLayout = compact ? 'detail' : 'overlay'"), '地图指标未根据实际空间回退到地震详情');
assert(styles.includes('body.map-metrics-in-detail .detail-grid .detail-map-fallback') && styles.includes('body.map-metrics-in-detail .map-stage > .map-metrics'), '地图指标与地震详情的响应式切换样式缺失');
assert(officialMap.includes('google.maps.ControlPosition.LEFT_BOTTOM'), 'Google 桌面缩放控件未放入左下安全区');
assert(/\.map-runtime-status\s*\{[\s\S]*?left:\s*50%;[\s\S]*?bottom:\s*44px;[\s\S]*?translateX\(-50%\)/.test(styles), '地图加载提示未放在底部中央');
assert(index.includes('rel="preconnect" href="https://webapi.amap.com"'), '首页缺少地图连接预热');
assert(officialMap.includes("preconnect.rel = 'preconnect'"), '地图提供方未动态预热连接');
assert(!server.includes('await triggerChinaHistoryRefresh'), '首页仍被历史数据刷新阻塞');
assert(styles.includes('flex: 0 0 42px') && styles.includes('html[lang="en"] .brand h1'), '桌面英文品牌标记可能被长标题挤压');
assert(index.includes('<h1>地震数据监控</h1>') && mobile.includes('<b>地震数据监控</b>'), '双端主标题未统一为地震数据监控');
assert(i18n.includes("'地震数据监控': 'Earthquake Data Monitor'"), '英文主标题未统一为 Earthquake Data Monitor');
assert(index.includes('class="data-disclaimer"') && mobile.includes('class="data-disclaimer"'), '双端缺少明显的数据免责声明');
assert(i18n.includes('does not replace official government notices or emergency instructions'), '免责声明缺少英文版本');
assert(![index, mobile, i18n, app, mobileApp, voiceAlert, pushWorker, pushWorkerRuntime, server].join('\n').includes('预警'), '用户可见源码仍包含禁用的“预警”字样');

for (const [name, js, css] of [['desktop', app, styles], ['mobile', mobileApp, mobileStyles]]) {
  assert(js.includes('const THEME_TRANSITION_MS = 180'), `${name} 主题切换时长不是 180ms`);
  assert(css.includes('html.theme-transitioning'), `${name} 缺少统一主题过渡`);
  assert(/background-color 180ms linear/.test(css), `${name} 主题颜色过渡不是 180ms`);
  assert(js.includes('const MIN_HEALTHY_SOURCE_COUNT = 4'), `${name} 信源健康阈值不是 4`);
  assert(js.includes('connected === 0') && js.includes("'offline'") && js.includes("'warning'") && js.includes("'connected'"), `${name} 信源三色判定不完整`);
  assert(js.includes('getBrowserLocationOnce') && js.includes('if (state.browserLocationPromise) return state.browserLocationPromise'), `${name} 未复用单次定位请求`);
}
assert(app.includes("activeItems = items.filter(item => item.status !== 'closed')"), '桌面端仍把关闭信源计入分母');
assert(mobileApp.includes("activeSources = viewSources.filter(source => (source.status || 'closed') !== 'closed')"), '手机端仍把关闭信源计入分母');
assert(app.includes('liveChannelStatus(') && app.includes('connectedSourceCount()'), '桌面实时通道未使用共用信源判定');
assert(mobileApp.includes('liveChannelStatus(') && mobileApp.includes('MIN_HEALTHY_SOURCE_COUNT'), '手机实时通道未使用共用信源判定');
assert.deepStrictEqual(sharedRuntime.liveChannelStatus(4, 'connected', true, 4), { status: 'connected', tone: 'connected', label: '实时通道已连接' });
assert.deepStrictEqual(sharedRuntime.liveChannelStatus(3, 'connected', true, 4), { status: 'connecting', tone: 'warning', label: '实时通道正在连接' });
assert.deepStrictEqual(sharedRuntime.liveChannelStatus(1, 'connected', true, 4), { status: 'connecting', tone: 'warning', label: '实时通道正在连接' });
assert.deepStrictEqual(sharedRuntime.liveChannelStatus(0, 'connected', true, 4), { status: 'closed', tone: 'offline', label: '实时通道未连接' });
assert.deepStrictEqual(sharedRuntime.liveChannelStatus(7, 'disconnected', true, 4), { status: 'connected', tone: 'connected', label: '实时通道已连接' });
assert.deepStrictEqual(sharedRuntime.liveChannelStatus(7, 'disconnected', false, 4), { status: 'closed', tone: 'offline', label: '实时通道未连接' });
for (const [name, js] of [['desktop', app], ['mobile', mobileApp]]) {
  assert(js.includes('SOURCE_SNAPSHOT_MAX_AGE_MS = 30000') && js.includes('sourceSnapshotAt'), `${name} 信源快照缺少新鲜度限制`);
  assert(js.includes('hasFreshSourceSnapshot()'), `${name} 实时通道未使用新鲜信源快照`);
}
assert(/@media \(max-width:\s*1180px\)[\s\S]*?\.detail-grid\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?grid-template-rows:\s*repeat\(3, minmax\(86px, auto\)\)/.test(styles), '桌面小窗口详情网格仍可能折叠');
assert(i18n.includes("'实时通道正在连接': 'Live channel connecting'") && i18n.includes("'实时通道未连接': 'Live channel not connected'"), '实时通道英文状态缺失');
for (const [name, js, css] of [['desktop', app, styles], ['mobile', mobileApp, mobileStyles]]) {
  assert(js.includes('placeGuideElements(') && js.includes("behavior: 'auto'"), `${name} 引导气泡未使用视口避让定位`);
  assert(js.includes('refreshGuidePlacement') && js.includes("setAttribute('aria-modal', 'true')"), `${name} 引导层未响应窗口变化或缺少模态语义`);
  assert(css.includes('max-height: calc(100dvh -') && css.includes('overscroll-behavior: contain'), `${name} 引导气泡在极小窗口可能溢出`);
}
assert(app.includes("'#desktop-settings-open-compact'") && app.includes("'#desktop-settings-open'"), '桌面引导未选择当前可见的设置按钮');
assert(secureStorage.includes('grid-template-rows:minmax(0,1fr) auto') && secureStorage.includes('max-height:calc(100dvh - 16px)') && secureStorage.includes('position:sticky;bottom:0'), 'Cookie 弹窗在最小窗口缺少滚动与固定操作区');

assert(shared.includes("{ key: 'yandex', label: 'Yandex' }"), 'Yandex 页面标签异常');
assert(!/Yandex\s+(?:\d+|\$\{[^}]+\})\s*\/\s*100/.test([index, mobile, app, mobileApp, shared].join('\n')), '页面仍公开显示 Yandex 计数器');
assert(server.includes("timeZone: 'Europe/Moscow'"), 'Yandex 配额未按莫斯科时区重置');
assert(server.includes("path.join(DATA_DIR, 'yandex-map-quota.json')"), 'Yandex 配额未保存在服务端数据目录');
assert(server.includes('Math.min(100') && server.includes('YANDEX_DAILY_LIMIT'), 'Yandex 每日额度未限制为最多 100');

for (const [name, js] of [['desktop', app], ['mobile', mobileApp]]) {
  assert(js.includes('value.length >= 8 && value.length <= 128'), `${name} 调试密码长度规则缺失`);
  assert(js.includes('uppercase: /[A-Z]/') && js.includes('number: /[0-9]/') && js.includes('special: /[^A-Za-z0-9\\s]/'), `${name} 调试密码复杂度规则缺失`);
}
assert(server.includes('password.length < 8 || password.length > 128'), '服务端调试密码长度规则缺失');
assert(server.includes("missing.push('至少 1 个大写字母')") && server.includes("missing.push('至少 1 个数字')") && server.includes("missing.push('至少 1 个特殊符号（例如 @）')"), '服务端调试密码复杂度规则缺失');
assert(pushWorkerRuntime.includes("self.addEventListener('pushsubscriptionchange'") && pushWorkerRuntime.includes("fetch('/push/resubscribe'"), '后台推送订阅不能自动续订');
assert(pushWorkerRuntime.includes('silent: false') && pushWorkerRuntime.includes('renotify: true'), '后台地震通知仍为静默模式');
assert(pushWorkerRuntime.includes("fetch('/push/test-ack'") && pushWorkerRuntime.includes('await self.registration.showNotification'), '设备通知缺少创建后的服务端回执');
assert(pushWorkerRuntime.includes('getNotifications({ tag })') && pushWorkerRuntime.includes('notificationPresent'), '设备回执未校验 Service Worker 中的通知对象');
assert(server.includes("app.get('/push/status'") && server.includes('sendPushWithRetry'), '服务端缺少推送状态或失败重试');
assert(server.includes("app.get('/push/test-status'") && server.includes('res.status(202).json({ ok: true, accepted: true, testId })'), '通知测试仍使用长时间同步请求');
assert(server.includes("app.post('/push/test-ack'") && server.includes("state: 'provider_accepted'") && server.includes("code: 'device_ack_timeout'"), '通知测试没有区分厂商接受与设备确认');
assert(pushClient.includes('waitForTestResult(testId)') && pushClient.includes("fetchJson(`/push/test-status?id=${encodeURIComponent(testId)}`"), '统一推送客户端未轮询后台结果');
assert(pushClient.includes('const PUSH_WORKERS = Object.freeze') && pushClient.includes('const TEST_RESULT_POLL_MS = 2000'), '双端推送 Worker 配置或轮询频率可能触发限流');
assert(index.includes('id="desktop-debug-float-test-notification"') && mobile.includes('id="mobile-debug-test-notification"'), '双端缺少本机通知测试入口');
assert(index.includes('id="desktop-debug-float-test-push"'), '桌面端缺少独立后台推送诊断入口');
assert(index.includes('/push-client.js') && mobile.includes('push-client.js'), '双端未加载统一推送客户端');
assert(mobile.includes('id="mobile-notification-toggle"') && mobile.includes('id="mobile-notification-settings-panel"'), '手机端缺少后台推送开关或条件设置');
assert(mobile.includes('id="mobile-notify-country"') && mobile.includes('id="mobile-notify-district"'), '手机端推送地区设置不完整');
for (const [name, js, selectedExpression] of [['desktop', app, 'selectedLatestEvent()'], ['mobile', mobileApp, 'selectedEvent()']]) {
  assert(js.includes('sendPushEventToCurrentDevice(event)') && js.includes('window.QuakePush.sendEvent(event'), `${name} 本机通知未通过 Node 后台推送到当前订阅`);
  assert(js.includes(selectedExpression) && js.includes('window.QuakePush.deliveryMessage(result)'), `${name} 本机通知未使用当前选中地震或仍误报系统横幅已显示`);
  assert(js.includes('debugForceVisible: true') && js.includes('设备推送已发送'), `${name} 测试地震未先显示再发送设备通知`);
  assert(!js.includes('registration.showNotification('), `${name} 仍绕过服务端直接显示本机通知`);
}
assert(app.includes('testDesktopBackgroundPush') && pushClient.includes("fetchJson('/push/test'"), '后台推送诊断链路被意外删除');
assert(server.includes('TTL: validTestId ? 120 : 3600') && server.includes("urgency: 'high'"), '后台推送保留时间或优先级不符合要求');
assert(server.includes('`quake-test-${validTestId}`') && server.includes('`${key}:${phase}:${validTestId}`'), '重复测试通知仍可能被浏览器厂商合并');
assert(pushClient.includes('function deliveryMessage(result)') && pushClient.includes('Win+N'), '设备通知成功提示未区分浏览器创建与系统横幅显示');
assert(pushClient.includes('navigator.serviceWorker.ready') && pushClient.includes('waitForPushWorkerActivation(registration, config)'), '浏览器未等待推送 Service Worker 激活');
assert(pushClient.includes('userVisibleOnly: true') && pushClient.includes('applicationServerKey'), '浏览器订阅参数不符合 Push API 要求');
assert(pushClient.includes('for (let attempt = 0; attempt < 2; attempt += 1)') && pushClient.includes('resetProjectWorkerRegistration(config)'), '失效推送订阅缺少一次性自动修复');
assert(app.includes('bindPushSubscriptionRefresh()') && app.includes('15 * 60 * 1000'), '浏览器未定期修复后台推送订阅');
assert(mobileApp.includes('bindMobilePushSubscriptionRefresh()') && mobileApp.includes('15 * 60 * 1000'), '手机端未定期修复后台推送订阅');
assert(server.includes("host === 'fcm.googleapis.com'") && server.includes("host === 'android.googleapis.com'"), '服务端缺少 Chrome FCM 推送端点支持');
assert(server.includes("host.endsWith('.notify.windows.com')") && server.includes("host.endsWith('.push.services.mozilla.com')") && server.includes("host.endsWith('.push.apple.com')"), '服务端浏览器推送服务兼容不完整');
assert(server.includes('function sanitizePushClientPath(value)') && server.includes("value === '/mobile.html' ? '/mobile.html' : '/'"), '推送通知打开地址缺少同源白名单');
assert(server.includes('clientPath: sanitizePushClientPath(req.body.clientPath)') && server.includes('url: sanitizePushClientPath(record.clientPath)'), '推送订阅未保存或使用安全的双端打开地址');
assert(pushClient.includes("desktop: Object.freeze({ kind: 'desktop', url: '/push-sw.js', scope: '/desktop-push/' })"), '桌面 Edge 未使用独立推送 Worker 作用域');
assert(pushClient.includes("mobile: Object.freeze({ kind: 'mobile', url: '/sw.js', scope: '/' })"), '手机端已验证的根作用域推送链路被改动');
assert(pushClient.includes('migrateLegacyDesktopSubscription(config)') && pushClient.includes('exactWorkerRegistration(pushWorkerConfig(options))'), '旧桌面订阅迁移或双端定向注销缺失');
assert(pushWorkerRuntime.includes("presentationProfile === 'mobile'") && pushWorkerRuntime.includes('options.vibrate') && pushWorkerRuntime.includes('workerScope: registrationScopePath()'), '手机通知注意力参数或桌面作用域回执缺失');
assert(server.includes('presentationProfile,') && server.includes("vibrate: presentationProfile === 'mobile' ? [280, 120, 280] : undefined"), '服务端未按双端生成通知呈现配置');
assert(server.includes("PUSH_TRANSPORT.mode === 'proxy'") && server.includes("PUSH_TRANSPORT.mode === 'relay'"), '后台推送缺少代理或中继传输路径');
assert(server.includes("createHmac('sha256', PUSH_TRANSPORT.relaySecret)"), 'Node 到推送中继的请求未使用 HMAC');
assert(pushRelayWorker.includes("hostname === 'fcm.googleapis.com'") && pushRelayWorker.includes("hostname.endsWith('.notify.windows.com')"), 'Cloudflare 中继缺少 Chrome FCM 或 Edge WNS 支持');
assert(pushRelayWorker.includes('MAX_REQUEST_BYTES') && pushRelayWorker.includes('ALLOWED_HEADER_NAMES') && pushRelayWorker.includes('hmacHex'), 'Cloudflare 中继缺少请求边界或签名校验');
assert(pushRelayWorker.includes("url.pathname === '/diagnostics'") && pushRelayWorker.includes('authenticated: true') && pushRelayWorker.includes('provider_connection_failed'), 'Cloudflare 中继缺少签名自检或分阶段错误诊断');
assert(server.includes('relayHost') && server.includes('relayProbe') && !server.includes('relaySecret: PUSH_TRANSPORT.relaySecret'), '推送状态未公开安全诊断信息或泄露中继密钥');
assert(packageScript.includes("'cloudflare', 'lib', 'public', 'scripts'"), '发布包遗漏台湾繁转简模块');

const taiwanFixture = {
  ReportContent: '臺灣花蓮縣近海發生有感地震',
  Intensity: { ShakingArea: [{ AreaDesc: '宜蘭縣地區', CountyName: '宜蘭縣' }] }
};
const simplifiedTaiwanFixture = simplifyTaiwanPayload(taiwanFixture);
const taiwanLocationFixture = sharedRuntime.taiwanLocationLayout(
  '嘉义县政府东北东方 38.5 公里（位于嘉义县梅山乡）',
  { source: 'cwa_taiwan', sourceLabel: '中国台湾 CWA' }
);
assert.strictEqual(simplifyTaiwanText('最大震度與發布時間'), '最大震度与发布时间', '台湾文本未完整转换为简体中文');
assert.strictEqual(simplifiedTaiwanFixture.ReportContent, '台湾花莲县近海发生有感地震', '台湾 CWA 主报告未转换为简体中文');
assert.strictEqual(simplifiedTaiwanFixture.Intensity.ShakingArea[0].AreaDesc, '宜兰县地区', '台湾 CWA 嵌套震度字段未转换为简体中文');
assert.strictEqual(taiwanFixture.ReportContent, '臺灣花蓮縣近海發生有感地震', '台湾繁转简意外修改了原始对象');
assert.deepStrictEqual(taiwanLocationFixture.lines, [
  '嘉义县政府 东北东方 38.5 公里',
  '（位于嘉义县梅山乡）'
], '台湾 CWA 震中描述未按语义稳定断行');
assert(app.includes("placeNode.classList.add('is-taiwan-location')") && app.includes("Math.max(18, Math.floor(baseSize * availableWidth / widestLine))"), '桌面台湾信源缺少统一字号自适应');
assert(mobileApp.includes('renderMobileEventLocation(event, event.location') && mobileStyles.includes('.mobile-location-line'), '手机台湾信源缺少语义断行或统一字号样式');
assert(index.includes('id="desktop-debug-floating-panel" role="region" tabindex="-1"'), '桌面调试工具缺少可聚焦语义');
assert(styles.includes('--z-debug-panel: 4200') && styles.includes('z-index: var(--z-debug-panel)'), '桌面调试工具层级未纳入语义层级表');
assert(styles.includes('.debug-panel-handle > span') && styles.includes('grid-template-columns: minmax(0, 1fr)'), '桌面调试工具标题与状态未使用稳定分行布局');
assert(app.includes('positionDebugPanelInViewport(panel, reset)') && !app.includes("!debugEnabled || mobile"), '桌面小窗口仍会隐藏调试工具或不能限制在视口内');
assert(deployScript.includes('Removed stale systemd drop-ins') && deployScript.includes('Service path mismatch:'), '部署脚本不能清理旧 /app 配置或校验进程目录');
assert(deployScript.indexOf('npm ci --omit=dev --ignore-scripts --no-audit --no-fund') < deployScript.indexOf('systemctl stop "${SERVICE_NAME}"'), '部署脚本仍在停止现网服务后安装依赖');
assert(deployScript.includes('zzzz-earthquake-deploy-safe-stop.conf') && deployScript.includes('ExecStopPost=') && deployScript.includes('SuccessAction=none'), '部署脚本缺少旧 systemd 停止钩子隔离');
assert(deployScript.includes('resource_preflight') && deployScript.includes('DEPLOY_MIN_AVAILABLE_MB'), '部署脚本缺少低资源预检');
assert(deployScript.includes('push_network_preflight') && deployScript.includes('REQUIRE_PUSH_READY'), '部署脚本仍会因临时推送网络故障无条件阻止网站升级');
assert(server.includes('startPushRelayRecoveryMonitor()') && server.includes('PUSH_RELAY_RETRY_INTERVAL_MS'), '服务端缺少推送中继自动恢复检查');

assert(!index.includes('desktop-obs-toggle') && !app.includes('quakeObsEnabled'), '桌面设置仍包含 OBS 客户端开关');
assert(server.includes("process.env.OBS_ENABLED || 'true'") && server.includes('async function sendObsPage'), 'OBS 未改为服务器配置控制');
assert(read('public/obs.css').includes('grid-template-rows: clamp(70px, 8.5vh, 92px) minmax(0, 1fr) clamp(104px, 12.2vh, 132px);'), 'OBS 主布局仍保留空白网格行');
assert(app.includes('list.replaceChildren(fragment)') && read('public/obs.js').includes('list.replaceChildren(fragment)'), '实时事件列表仍使用不安全的 HTML 拼接');
assert(!app.includes('Math.random()') && !mobileApp.includes('Math.random()'), '调试事件仍使用非加密随机源');
assert(!voiceAlert.includes('window.localStorage') && voiceAlert.includes('SecureStorage'), '语音去重信息仍以明文写入浏览器存储');
assert(server.includes("require('express-rate-limit')"), 'Express 路由缺少标准限流中间件');

console.log('Feature checks passed.');
