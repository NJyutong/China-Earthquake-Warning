const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const dns = require('dns');
const net = require('net');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const WebSocket = require('ws');
const { assetVersion: ASSET_VERSION } = require('./scripts/version');
const { simplifyTaiwanPayload } = require('./lib/taiwan-simplifier');
let webPush = null;
let webPushLoadError = null;
try {
  webPush = require('web-push');
} catch (error) {
  webPush = null;
  webPushLoadError = error;
}
const {
  SOURCES,
  BACKUP_SOURCES,
  ALL_SOURCES,
  AREA_OPTIONS,
  standardizePlaceName,
  normalizeEarthquakeData,
  getEventKey,
  isRealEarthquake,
  matchesArea,
  estimateWaveCountdowns,
  estimateEpicenterIntensity,
  estimateLocalIntensity,
  intensityColor,
  formatCountdown
} = require('./public/shared');

const LOCAL_ENV_PATH = path.join(__dirname, '.env');
if (!/^(?:1|true|yes|on)$/i.test(String(process.env.SKIP_LOCAL_ENV || ''))) loadLocalEnv();

const DNS_RESULT_ORDER = normalizeDnsResultOrder(process.env.DNS_RESULT_ORDER);
dns.setDefaultResultOrder(DNS_RESULT_ORDER);

const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || '127.0.0.1').trim() || '127.0.0.1';
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || 'https://www.cnquake.xyz').replace(/\/+$/, '');
const AMAP_JS_KEY = process.env.AMAP_JS_KEY || process.env.AMAP_API_KEY || process.env.AMAP_KEY || process.env.AMAP_TOKEN || process.env.GAODE_MAPS_API_KEY || '';
const AMAP_SECURITY_JSCODE = process.env.AMAP_SECURITY_JSCODE || process.env.AMAP_JSCODE || process.env.GAODE_SECURITY_JSCODE || '';
const YANDEX_MAPS_API_KEY = process.env.YANDEX_MAPS_API_KEY || process.env.YANDEX_MAPS_JS_KEY || '';
const YANDEX_DAILY_LIMIT = Math.min(100, Math.max(1, Number(process.env.YANDEX_DAILY_LIMIT || 100) || 100));
const OBS_ENABLED = !/^(?:0|false|no|off)$/i.test(String(process.env.OBS_ENABLED || 'true'));
const TRUST_GEO_HEADERS = /^(?:1|true|yes|on)$/i.test(String(process.env.TRUST_GEO_HEADERS || ''));
const PUSH_TRANSPORT = resolvePushTransport();
const PUSH_SEND_TIMEOUT_MS = Math.min(
  30000,
  Math.max(3000, Number(process.env.PUSH_SEND_TIMEOUT_MS || 10000) || 10000)
);
const AMAP_SERVICE_PREFIX = '/_AMapService';
const CWA_DATASET_PATH = '/api/v1/rest/datastore/E-A0015-001';
const HTTP_MAX_HEADER_SIZE = Math.min(
  64 * 1024,
  Math.max(16 * 1024, Number(process.env.HTTP_MAX_HEADER_SIZE || 32 * 1024) || 32 * 1024)
);
const TRUST_PROXY = parseTrustProxySetting(process.env.TRUST_PROXY);
const MAX_DEMO_EVENTS = 10;
const HISTORY_CACHE_LIMIT = 30;
const HISTORY_CACHE_INTERVAL_MS = 5000;
const USER_FORCE_HISTORY_REFRESH_MS = 5 * 60 * 1000;
const SOURCE_CACHE_INTERVAL_MS = 60 * 60 * 1000;
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || 'data');
const HISTORY_CACHE_PATH = path.join(DATA_DIR, 'china-history-cache.json');
const PUSH_SUBSCRIPTIONS_PATH = path.join(DATA_DIR, 'push-subscriptions.json');
const VAPID_KEYS_PATH = path.join(DATA_DIR, 'vapid-keys.json');
const DEBUG_PASSWORD_PATH = path.join(DATA_DIR, 'debug-password.json');
const DEBUG_AUDIT_PATH = path.join(DATA_DIR, 'debug-audit.json');
const YANDEX_QUOTA_PATH = path.join(DATA_DIR, 'yandex-map-quota.json');
const DEBUG_AUDIT_RESET_MS = 7 * 24 * 60 * 60 * 1000;
const WS_MAX_CONNECTIONS_PER_IP = 8;
const WS_MAX_CONNECTIONS = Math.max(32, Number(process.env.WS_MAX_CONNECTIONS || 512) || 512);
const WS_MAX_MESSAGES_PER_MINUTE = 30;
const WS_MAX_CLIENT_PAYLOAD = 16 * 1024;
const WS_MAX_UPSTREAM_PAYLOAD = 1024 * 1024;
const WS_MAX_BUFFERED_BYTES = 1024 * 1024;
const MAX_RATE_LIMIT_BUCKETS = 5000;
const MAX_PUSH_SUBSCRIPTIONS = Math.max(100, Number(process.env.MAX_PUSH_SUBSCRIPTIONS || 10000) || 10000);
const MAX_PUSH_TEST_RESULTS = 200;
const PUSH_TEST_RESULT_TTL_MS = 5 * 60 * 1000;
const PUSH_TEST_DEVICE_ACK_TIMEOUT_MS = Math.min(
  45000,
  Math.max(10000, Number(process.env.PUSH_TEST_DEVICE_ACK_TIMEOUT_MS || 20000) || 20000)
);
const PUSH_NOTIFICATION_CREATED_MESSAGE = '推送已到达浏览器，Service Worker 已确认创建通知对象。操作系统是否弹出横幅取决于系统通知设置。';
const PUSH_RELAY_PROBE_TIMEOUT_MS = 7000;
const PUSH_RELAY_RETRY_INTERVAL_MS = Math.min(
  15 * 60 * 1000,
  Math.max(30 * 1000, Number(process.env.PUSH_RELAY_RETRY_INTERVAL_MS || 60 * 1000) || 60 * 1000)
);
const PUSH_RELAY_MAX_RESPONSE_BYTES = 64 * 1024;
const SERVER_MAX_CONNECTIONS = Math.max(64, Number(process.env.SERVER_MAX_CONNECTIONS || 1024) || 1024);
const CLIENT_COOKIE_PREFIX = 'qs_';
const CLIENT_COOKIE_RESET_NAMES = ['qs_cookie_consent', 'qs_guide_seen'];
const CENC_EQLIST_CACHE_MS = 5000;
const HISTORY_HOOK_URLS = (process.env.CHINA_HISTORY_HOOK_URLS || process.env.CHINA_HISTORY_HOOK_URL || '')
  .split(',')
  .map(url => url.trim())
  .filter(Boolean);
const ADMIN_CENTERS = [
  ['北京市 东城区', 39.9042, 116.4074],
  ['天津市 和平区', 39.1200, 117.1902],
  ['上海市 黄浦区', 31.2304, 121.4737],
  ['重庆市 渝中区', 29.5630, 106.5516],
  ['河北省 石家庄市 长安区', 38.0428, 114.5149],
  ['山西省 太原市 迎泽区', 37.8706, 112.5489],
  ['内蒙古自治区 呼和浩特市 新城区', 40.8426, 111.7492],
  ['辽宁省 沈阳市 和平区', 41.8057, 123.4315],
  ['吉林省 长春市 南关区', 43.8171, 125.3235],
  ['黑龙江省 哈尔滨市 道里区', 45.8038, 126.5349],
  ['江苏省 南京市 玄武区', 32.0603, 118.7969],
  ['浙江省 杭州市 上城区', 30.2741, 120.1551],
  ['安徽省 合肥市 蜀山区', 31.8206, 117.2272],
  ['福建省 福州市 鼓楼区', 26.0745, 119.2965],
  ['江西省 南昌市 东湖区', 28.6820, 115.8579],
  ['山东省 济南市 历下区', 36.6512, 117.1201],
  ['河南省 郑州市 金水区', 34.7466, 113.6254],
  ['湖北省 武汉市 江岸区', 30.5928, 114.3055],
  ['湖南省 长沙市 岳麓区', 28.2282, 112.9388],
  ['广东省 广州市 越秀区', 23.1291, 113.2644],
  ['广西壮族自治区 南宁市 青秀区', 22.8170, 108.3669],
  ['海南省 海口市 龙华区', 20.0440, 110.1999],
  ['四川省 成都市 武侯区', 30.5728, 104.0668],
  ['贵州省 贵阳市 观山湖区', 26.6470, 106.6302],
  ['云南省 昆明市 五华区', 25.0389, 102.7183],
  ['西藏自治区 拉萨市 城关区', 29.6525, 91.1721],
  ['陕西省 西安市 新城区', 34.3416, 108.9398],
  ['甘肃省 兰州市 城关区', 36.0611, 103.8343],
  ['青海省 西宁市 城中区', 36.6171, 101.7782],
  ['宁夏回族自治区 银川市 兴庆区', 38.4872, 106.2309],
  ['新疆维吾尔自治区 乌鲁木齐市 天山区', 43.8256, 87.6168],
  ['香港特别行政区 中西区', 22.3193, 114.1694],
  ['澳门特别行政区 大堂区', 22.1987, 113.5439],
  ['台湾省 台北市 信义区', 25.0330, 121.5654],
  ['四川省 阿坝藏族羌族自治州 汶川县', 31.03, 103.42],
  ['四川省 甘孜藏族自治州 康定市', 30.05, 101.96],
  ['云南省 昭通市 鲁甸县', 27.10, 103.30],
  ['青海省 海北藏族自治州 门源回族自治县', 37.77, 101.26],
  ['新疆维吾尔自治区 阿克苏地区 乌什县', 41.26, 78.63],
  ['西藏自治区 日喀则市 定日县', 28.50, 87.45]
].map(([place, lat, lon]) => ({ place, lat, lon }));
const DEFAULT_FILTER = { country: 'CN_MAINLAND', region: 'all' };
const DEMO_FILTER = { country: 'CN_MAINLAND', region: 'all' };
const DEMO_MIN_MAGNITUDE = 6;
const SAME_EVENT_TIME_WINDOW_MS = 2 * 60 * 1000;
const SAME_EVENT_DISTANCE_KM = 120;
const CENC_OFFICIAL_SOURCE_KEYS = new Set(['cenc_eqlist', 'cenc_eqlist_api', 'cenc_history', 'cenc_history_search']);
const OFFICIAL_FIELDS = ['location', 'magnitude', 'depth', 'latitude', 'longitude', 'originTime', 'intensity'];
const MAINLAND_SOURCE_KEYS = new Set(SOURCES.map(source => source.key));
const HISTORY_SOURCE = {
  key: 'cenc_history',
  label: '中国地震台网历史',
  url: 'https://news.ceic.ac.cn/ajax/google'
};
const HISTORY_SOURCES = [
  HISTORY_SOURCE,
  {
    ...HISTORY_SOURCE,
    key: 'cenc_history_search',
    url: 'https://news.ceic.ac.cn/ajax/search?page=1&start=&end=&jingdu1=&jingdu2=&weidu1=&weidu2=&height1=&height2=&zhenji1=&zhenji2='
  },
  ...BACKUP_SOURCES.filter(source => source.type === 'poll')
];

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', TRUST_PROXY);
const server = createServer(app);
const localWss = new WebSocket.Server({
  server,
  path: '/ws',
  maxPayload: WS_MAX_CLIENT_PAYLOAD,
  perMessageDeflate: false,
  verifyClient: verifyWebSocketClient
});
const publicDir = path.join(__dirname, 'public');
const openLayersDir = path.join(__dirname, 'node_modules', 'ol');
const pinyinProDir = path.join(__dirname, 'node_modules', 'pinyin-pro', 'dist');
const sourceStates = new Map();
const recentEvents = [];
const pushSubscriptions = new Map();
const pushTestResults = new Map();
const pushHttpsAgent = ['direct', 'relay'].includes(PUSH_TRANSPORT.mode) ? createPushHttpsAgent() : null;
const sentPushKeys = new Set();
const requestBuckets = new Map();
const userHistoryRefreshes = new Map();
const geoLookupCache = new Map();
const cencListSeenKeys = new Set();
let chinaHistoryCache = { updatedAt: 0, events: [] };
let chinaHistoryRefreshPromise = null;
let cencListMonitorTimer = null;
let cencListMonitorPrimed = false;
let cencEqlistCache = { updatedAt: 0, data: null, promise: null };
let debugPassword = '';
let debugPasswordManagedByEnv = false;
let vapidKeys = null;
let vapidKeysSource = '';
let pushSupportError = '';
let pushSubscriptionsLoaded = false;
let pushSavePromise = Promise.resolve();
let lastPushDispatch = null;
let pushRelayProbe = null;
let pushRelayProbeStartedAt = 0;
let yandexQuotaState = emptyYandexQuotaState();
let yandexQuotaSavePromise = Promise.resolve();
let serverErrorHandled = false;

server.on('error', handleServerError);
server.on('clientError', handleClientError);
localWss.on('error', handleServerError);
startWebSocketHeartbeat();

app.use(securityHeaders);
app.use(redirectPublicHttpToHttps);
app.use(enforceRequestBoundary);
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));
app.use(rateLimitBan);
app.use(rejectCrossOriginMutation);
app.use('/push', requireHttpsRequest);
app.use('/map/yandex-access', requireHttpsOrLoopbackRequest);
app.use(AMAP_SERVICE_PREFIX, proxyAmapService);
app.use(express.json({ limit: '64kb' }));
app.get('/obs.html', asyncRoute(sendObsPage));
app.use('/vendor/ol', express.static(openLayersDir, {
  index: false,
  maxAge: '1d',
  immutable: true
}));
app.use('/vendor/pinyin-pro', express.static(pinyinProDir, {
  index: false,
  maxAge: '30d',
  immutable: true
}));
app.use(express.static(publicDir, {
  index: false,
  setHeaders(res, filePath) {
    const originalUrl = String(res.req && res.req.originalUrl || '');
    const versionValue = (originalUrl.match(/[?&]v=([^&#]*)/) || [])[1] || '';
    const versionedAsset = versionValue === ASSET_VERSION;
    if (/\.(?:css|js)$/i.test(filePath) && versionedAsset) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(?:html|css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));
app.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, version: ASSET_VERSION });
});
app.get('/config', asyncRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(publicClientConfig(req));
}));
app.post('/map/yandex-access', asyncRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!YANDEX_MAPS_API_KEY) {
    res.status(503).json({ ok: false, message: 'Yandex Maps API Key 未配置' });
    return;
  }
  const sessionId = normalizeYandexSessionId(req.body && req.body.sessionId);
  if (!sessionId) {
    res.status(400).json({ ok: false, message: 'Yandex 地图会话标识无效' });
    return;
  }
  const grant = await grantYandexMapAccess(clientIp(req), sessionId);
  if (!grant.ok) {
    res.status(429).json(grant);
    return;
  }
  res.json({
    ok: true,
    apiKey: YANDEX_MAPS_API_KEY,
    used: grant.used,
    remaining: grant.remaining,
    deduplicated: grant.deduplicated
  });
}));
app.get('/push/public-key', (_req, res) => {
  const supported = ensurePushSupport();
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    supported,
    publicKey: supported ? vapidKeys.publicKey : '',
    persistent: supported ? vapidKeysSource !== 'memory' : false,
    message: supported ? '' : pushSupportMessage()
  });
});
app.get('/push/status', (_req, res) => {
  const supported = ensurePushSupport();
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    supported,
    subscriptionCount: supported ? pushSubscriptions.size : 0,
    persistent: supported ? vapidKeysSource !== 'memory' : false,
    transport: publicPushTransport(),
    lastDispatch: lastPushDispatch,
    message: supported ? '' : pushSupportMessage()
  });
});
app.post('/push/subscribe', asyncRoute(async (req, res) => {
  if (!ensurePushSupport()) {
    res.json({ ok: false, supported: false, message: pushSupportMessage() });
    return;
  }
  const subscription = normalizePushSubscription(req.body && req.body.subscription);
  if (!subscription) {
    res.status(400).json({ ok: false, message: '推送订阅无效' });
    return;
  }
  if (!pushSubscriptions.has(subscription.endpoint) && pushSubscriptions.size >= MAX_PUSH_SUBSCRIPTIONS) {
    res.status(503).json({ ok: false, message: '推送订阅数量已达服务端上限，请联系管理员扩容' });
    return;
  }
  const record = {
    subscription,
    threshold: clampPushThreshold(req.body.threshold),
    area: sanitizePushArea(req.body.area),
    userLocation: readUserLocation(req.body.userLocation),
    clientPath: sanitizePushClientPath(req.body.clientPath),
    updatedAt: new Date().toISOString()
  };
  pushSubscriptions.set(subscription.endpoint, record);
  await savePushSubscriptions();
  reconcileSources();
  res.json({ ok: true, supported: true, registered: true });
}));
app.post('/push/resubscribe', asyncRoute(async (req, res) => {
  if (!ensurePushSupport()) {
    res.json({ ok: false, supported: false, message: pushSupportMessage() });
    return;
  }
  const subscription = normalizePushSubscription(req.body && req.body.subscription);
  if (!subscription) {
    res.status(400).json({ ok: false, message: '推送订阅无效' });
    return;
  }
  const oldEndpoint = normalizePushEndpoint(req.body && req.body.oldEndpoint);
  const previous = oldEndpoint ? pushSubscriptions.get(oldEndpoint) : null;
  if (!pushSubscriptions.has(subscription.endpoint) && !previous && pushSubscriptions.size >= MAX_PUSH_SUBSCRIPTIONS) {
    res.status(503).json({ ok: false, message: '推送订阅数量已达服务端上限，请联系管理员扩容' });
    return;
  }
  const record = {
    subscription,
    threshold: previous ? previous.threshold : clampPushThreshold(req.body && req.body.threshold),
    area: previous ? previous.area : sanitizePushArea(req.body && req.body.area),
    userLocation: previous ? previous.userLocation : readUserLocation(req.body && req.body.userLocation),
    clientPath: previous ? previous.clientPath : sanitizePushClientPath(req.body && req.body.clientPath),
    updatedAt: new Date().toISOString()
  };
  if (oldEndpoint && oldEndpoint !== subscription.endpoint) pushSubscriptions.delete(oldEndpoint);
  pushSubscriptions.set(subscription.endpoint, record);
  await savePushSubscriptions();
  reconcileSources();
  res.json({ ok: true, supported: true, registered: true });
}));
app.post('/push/unsubscribe', asyncRoute(async (req, res) => {
  const endpoint = normalizePushEndpoint(req.body && req.body.endpoint);
  if (endpoint) {
    pushSubscriptions.delete(endpoint);
    await savePushSubscriptions();
    reconcileSources();
  }
  res.json({ ok: true });
}));
app.get('/push/test-status', (req, res) => {
  prunePushTestResults();
  const testId = safeText(req.query && req.query.id, 64);
  if (!isPushTestId(testId)) {
    res.status(400).json({ ok: false, message: '通知测试编号无效' });
    return;
  }
  const result = pushTestResults.get(testId);
  if (!result) {
    res.status(404).json({ ok: false, message: '通知测试结果已过期，请重新测试' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: result.state === 'completed' ? Boolean(result.ok) : true,
    state: result.state,
    completed: result.state === 'completed',
    code: result.code || '',
    message: result.message || '',
    resetSubscription: Boolean(result.resetSubscription),
    providerAccepted: Boolean(result.providerAccepted),
    providerStatus: Number(result.providerStatus) || 0,
    provider: result.provider || '',
    transport: result.transport || '',
    deviceAcknowledged: Boolean(result.deviceAcknowledged),
    notificationCreated: Boolean(result.notificationCreated),
    notificationTag: result.notificationTag || '',
    presentationVerification: result.presentationVerification || '',
    workerVersion: result.workerVersion || '',
    workerScope: result.workerScope || '',
    presentationProfile: result.presentationProfile || '',
    notificationCount: Number(result.notificationCount) || 0,
    diagnosticId: result.diagnosticId || ''
  });
});
app.post('/push/test-ack', (req, res) => {
  prunePushTestResults();
  const testId = safeText(req.body && req.body.testId, 64);
  const endpoint = normalizePushEndpoint(req.body && req.body.endpoint);
  const notificationTag = safeText(req.body && req.body.notificationTag, 128);
  const notificationPresent = req.body && req.body.notificationPresent === true;
  const presentationVerification = safeText(req.body && req.body.presentationVerification, 32);
  const workerVersion = safeText(req.body && req.body.workerVersion, 32);
  const requestedWorkerScope = safeText(req.body && req.body.workerScope, 64);
  const workerScope = ['/', '/desktop-push/'].includes(requestedWorkerScope) ? requestedWorkerScope : '';
  const requestedProfile = safeText(req.body && req.body.presentationProfile, 16);
  const presentationProfile = ['desktop', 'mobile'].includes(requestedProfile) ? requestedProfile : '';
  const notificationCount = Math.max(0, Math.min(20, Math.floor(Number(req.body && req.body.notificationCount) || 0)));
  if (!isPushTestId(testId) || !endpoint) {
    res.status(400).json({ ok: false, message: '设备通知回执无效' });
    return;
  }
  if (!notificationPresent || notificationTag !== `quake-test-${testId}`
    || !['get-notifications', 'show-promise'].includes(presentationVerification)) {
    res.status(409).json({ ok: false, message: 'Service Worker 未确认测试通知对象已创建' });
    return;
  }
  const result = pushTestResults.get(testId);
  if (!result) {
    res.status(404).json({ ok: false, message: '设备通知回执已过期' });
    return;
  }
  if (!safeSecretEqual(result.endpointHash, pushEndpointHash(endpoint))) {
    res.status(403).json({ ok: false, message: '设备通知回执与当前订阅不匹配' });
    return;
  }
  if (result.state === 'completed') {
    if (result.deviceAcknowledged && result.providerAccepted) {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, acknowledged: true, duplicate: true });
      return;
    }
    res.status(409).json({ ok: false, message: '推送服务未接受该测试消息，设备回执不能覆盖失败结果' });
    return;
  }
  const acknowledgedAt = Date.now();
  const completed = Boolean(result.providerAccepted);
  pushTestResults.set(testId, {
    ...result,
    state: completed ? 'completed' : 'device_ack_pending',
    completedAt: completed ? acknowledgedAt : null,
    acknowledgedAt,
    ok: completed,
    code: completed ? 'device_acknowledged' : 'device_ack_pending',
    message: completed
      ? PUSH_NOTIFICATION_CREATED_MESSAGE
      : '浏览器已创建通知对象，正在等待推送服务完成响应。',
    deviceAcknowledged: true,
    notificationCreated: true,
    notificationTag,
    presentationVerification,
    workerVersion,
    workerScope,
    presentationProfile,
    notificationCount
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, acknowledged: true });
});
app.post('/push/test', asyncRoute(async (req, res) => {
  if (!ensurePushSupport()) {
    res.json({ ok: false, message: pushSupportMessage() });
    return;
  }
  const endpoint = normalizePushEndpoint(req.body && req.body.endpoint);
  const record = endpoint ? pushSubscriptions.get(endpoint) : null;
  if (!record) {
    res.status(404).json({ ok: false, message: '没有找到当前浏览器的推送订阅' });
    return;
  }
  const event = sanitizePushTestEvent(req.body && req.body.event);
  if (!event) {
    res.status(400).json({ ok: false, message: '测试地震数据无效' });
    return;
  }
  record.userLocation = readUserLocation(req.body.userLocation) || record.userLocation || null;
  const testId = crypto.randomUUID();
  const provider = pushServiceInfo(endpoint);
  const expectedPresentationProfile = pushPresentationProfile(record);
  pushTestResults.set(testId, {
    state: 'pending',
    ok: false,
    createdAt: Date.now(),
    endpointHash: pushEndpointHash(endpoint),
    provider: provider.key,
    transport: PUSH_TRANSPORT.mode,
    expectedPresentationProfile,
    providerAccepted: false,
    deviceAcknowledged: false
  });
  prunePushTestResults();
  res.status(202).json({ ok: true, accepted: true, testId });
  sendPushWithRetry(endpoint, record, event, true, 'initial', testId)
    .then(delivery => completePushTest(testId, delivery))
    .catch(error => completePushTest(testId, {
      ok: false,
      code: 'push_test_failed',
      message: safeText(error && error.message, 200) || '后台推送测试失败'
    }));
}));
app.get('/sources', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ sources: allSourceStates() });
});
app.get('/app-icon.png', (_req, res) => {
  res.sendFile(path.join(publicDir, 'app-icon.png'));
});
app.get('/history', asyncRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const country = safeText(req.query.country || 'CN_MAINLAND', 32);
  const region = safeText(req.query.region || 'all', 48);
  const limit = Math.max(1, Math.min(30, Number(req.query.limit) || 10));
  const filter = { country, region };
  const userLocation = readUserLocation(req.query);
  if (country === 'CN_MAINLAND' && req.query.refresh === '1' && allowUserHistoryRefresh(req)) {
    await refreshChinaHistoryCache({ force: true });
  }
  if (country === 'CN_MAINLAND' && !chinaHistoryCache.events.length) {
    await refreshChinaHistoryCache({ force: true });
  }
  const cachedEvents = country === 'CN_MAINLAND' ? cachedChinaEvents(filter, limit) : [];
  const freshEvents = cachedEvents.length ? cachedEvents : await loadHistoricalEventsForFilter(filter, limit);
  res.json({
    cacheUpdatedAt: chinaHistoryCache.updatedAt ? new Date(chinaHistoryCache.updatedAt).toISOString() : null,
    events: withArrival(freshEvents.length ? freshEvents : filteredEvents(filter).slice(0, limit), userLocation)
  });
}));
app.get('/api/nearby-earthquakes', asyncRoute(async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const place = safeText(req.query.place || '用户位置', 120);
    const limit = Math.min(Math.max(Number(req.query.limit || 5), 1), 20);
    const sort = req.query.sort === 'time' ? 'time' : 'distance';

    if (!isUsableCoordinate(lat, lon)) {
      res.status(400).json({
        error: true,
        message: 'lat 和 lon 必须是有效数字'
      });
      return;
    }

    const raw = await fetchCencEqlist();
    const events = normalizeCencList(raw)
      .filter(event => Number.isFinite(event.latitude) && Number.isFinite(event.longitude))
      .map(event => {
        const distanceKm = haversineKm(lat, lon, event.latitude, event.longitude);
        return {
          ...event,
          distanceKm: Number(distanceKm.toFixed(1)),
          timeFromNow: getTimeFromNowText(event.originTime)
        };
      });

    if (sort === 'time') {
      events.sort((a, b) => b.originTimestamp - a.originTimestamp);
    } else {
      events.sort((a, b) => {
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        return b.originTimestamp - a.originTimestamp;
      });
    }

    res.json({
      userLocation: {
        place,
        latitude: lat,
        longitude: lon
      },
      serverTime: new Date().toISOString(),
      source: 'Wolfx Open API / CENC eqlist',
      sort,
      limit,
      totalAvailable: events.length,
      data: events.slice(0, limit)
    });
  } catch (error) {
    console.warn('附近地震接口失败:', error && error.message || error);
    res.status(500).json({
      error: true,
      message: '附近地震数据暂时不可用，请稍后重试'
    });
  }
}));
app.post('/arrival', (req, res) => {
  const userLocation = readUserLocation(req.body && req.body.userLocation);
  const event = req.body && req.body.event;
  if (!userLocation || !event) {
    res.status(400).json({ error: '需要 userLocation 和 event' });
    return;
  }
  res.json({ arrival: estimateWaveCountdowns(event, userLocation) });
});
app.get('/arrival', (req, res) => {
  const userLocation = readUserLocation(req.query);
  const event = {
    latitude: Number(req.query.eventLat),
    longitude: Number(req.query.eventLon),
    originTime: req.query.originTime,
    countdown: req.query.countdown
  };
  if (!userLocation || !isUsableCoordinate(event.latitude, event.longitude)) {
    res.status(400).json({ error: '需要 lat、lon、eventLat、eventLon' });
    return;
  }
  res.json({ arrival: estimateWaveCountdowns(event, userLocation) });
});

app.get('/geocode', (req, res) => {
  const query = safeText(req.query.q, 120);
  const known = knownPlace(query);
  if (!known) {
    res.status(404).json({ error: '未找到地址，可手动输入经纬度' });
    return;
  }
  res.json(known);
});

app.post('/geocode', (req, res) => {
  const query = safeText(req.body && req.body.q, 120);
  const known = knownPlace(query);
  if (!known) {
    res.status(404).json({ error: '未找到地址，可手动输入经纬度' });
    return;
  }
  res.json(known);
});

app.get('/ip-location', asyncRoute(async (req, res) => {
  res.json(await ipLocationFromRequest(req));
}));

app.get('/reverse-location', asyncRoute(async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!isUsableCoordinate(lat, lon)) {
    res.status(400).json({ error: '定位坐标无效' });
    return;
  }
  res.json(await resolveAdminLocation(lat, lon));
}));

app.post('/debug/verify', asyncRoute(async (req, res) => {
  const ok = safeSecretEqual(req.body && req.body.password, debugPassword);
  await recordDebugAudit('verify', req, ok);
  res.status(ok ? 200 : 401).json({ ok });
}));
app.post('/debug/change-password', asyncRoute(async (req, res) => {
  const oldPassword = String(req.body && req.body.oldPassword || '');
  const newPassword = String(req.body && req.body.newPassword || '');
  if (!safeSecretEqual(oldPassword, debugPassword)) {
    await recordDebugAudit('change-password', req, false);
    res.status(403).json({ ok: false, message: '原密码不正确' });
    return;
  }
  const policyError = debugPasswordPolicyError(newPassword);
  if (policyError) {
    await recordDebugAudit('change-password', req, false);
    res.status(400).json({ ok: false, message: policyError });
    return;
  }
  if (debugPasswordManagedByEnv) {
    await saveDebugPasswordValue(newPassword);
    const migrated = await removeLocalEnvDebugPassword(oldPassword);
    if (!migrated) {
      await saveDebugPasswordValue(debugPassword);
      res.status(409).json({
        ok: false,
        message: '调试密码由外部环境变量管理，无法在网页中修改，请更新服务配置后重启'
      });
      return;
    }
    debugPasswordManagedByEnv = false;
    delete process.env.DEBUG_PASSWORD;
  }
  debugPassword = newPassword;
  await saveDebugPassword();
  await recordDebugAudit('change-password', req, true);
  res.json({ ok: true });
}));
app.get('/obs', asyncRoute(sendObsPage));
app.get('/mobile', asyncRoute(async (_req, res) => {
  if (!isMobileRequest(_req)) {
    res.redirect(302, '/?desktop=1');
    return;
  }
  await sendPage(res, 'mobile.html');
}));
app.get('/', asyncRoute(async (req, res) => {
  await sendPage(res, req.query.desktop === '1' || !isMobileRequest(req) ? 'index.html' : 'mobile.html');
}));
app.use(handleRequestError);

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function sendPage(res, fileName) {
  const filePath = path.join(publicDir, fileName);
  try {
    triggerChinaHistoryRefresh(!chinaHistoryCache.events.length);
    const html = await fs.promises.readFile(filePath, 'utf8');
    const bootstrap = JSON.stringify({
      cacheUpdatedAt: chinaHistoryCache.updatedAt || 0,
      events: filteredEvents(DEFAULT_FILTER)
    }).replace(/</g, '\\u003c');
    const config = JSON.stringify(publicClientConfig(res.req)).replace(/</g, '\\u003c');
    const amapConfig = AMAP_SECURITY_JSCODE
      ? `window._AMapSecurityConfig={serviceHost:${JSON.stringify(amapServiceHost(res.req))}};`
      : '';
    const nonce = String(res.locals && res.locals.cspNonce || '');
    const injected = `<script nonce="${nonce}">window.__QUAKE_BOOTSTRAP__=${bootstrap};window.__QUAKE_CONFIG__=${config};${amapConfig}</script>`;
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(html.replace('</head>', `${injected}\n</head>`));
  } catch (_error) {
    res.sendFile(filePath);
  }
}

async function sendObsPage(_req, res) {
  if (!OBS_ENABLED) {
    res.status(404).type('text/plain').send('OBS output is disabled by server configuration.');
    return;
  }
  await sendPage(res, 'obs.html');
}

function loadLocalEnv() {
  if (!fs.existsSync(LOCAL_ENV_PATH)) return;
  const lines = fs.readFileSync(LOCAL_ENV_PATH, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const assignment = parseEnvAssignment(line);
    if (assignment && process.env[assignment.key] === undefined) {
      process.env[assignment.key] = assignment.value;
    }
  }
}

function parseEnvAssignment(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const index = trimmed.indexOf('=');
  if (index <= 0) return null;
  const key = trimmed.slice(0, index).trim();
  const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  return key ? { key, value } : null;
}

function publicClientConfig(req) {
  const normalizedCountryCode = TRUST_GEO_HEADERS
    ? headerValue(req, ['cf-ipcountry', 'x-vercel-ip-country', 'x-country-code']).toUpperCase()
    : '';
  const quota = currentYandexQuota();
  return {
    tiandituToken: process.env.TIANDITU_TOKEN || process.env.TIANDITU_TK || '',
    amapJsKey: AMAP_JS_KEY,
    amapServiceHost: AMAP_SECURITY_JSCODE ? amapServiceHost(req) : '',
    googleMapsJsKey: process.env.GOOGLE_MAPS_JS_KEY || process.env.GOOGLE_MAPS_API_KEY || '',
    yandexConfigured: Boolean(YANDEX_MAPS_API_KEY),
    yandexMapsAvailable: Boolean(YANDEX_MAPS_API_KEY && quota.used < YANDEX_DAILY_LIMIT),
    yandexDailyLimit: YANDEX_DAILY_LIMIT,
    yandexQuotaUsed: quota.used,
    yandexQuotaRemaining: quota.remaining,
    yandexQuotaExhausted: quota.used >= YANDEX_DAILY_LIMIT,
    clientCountryCode: normalizedCountryCode,
    esriApiKey: process.env.ESRI_API_KEY || '',
    obsEnabled: OBS_ENABLED
  };
}

function emptyYandexQuotaState() {
  return {
    day: yandexQuotaDay(),
    total: 0,
    sessions: {}
  };
}

function yandexQuotaDay(value = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function loadYandexQuota() {
  yandexQuotaState = emptyYandexQuotaState();
  try {
    const parsed = JSON.parse(fs.readFileSync(YANDEX_QUOTA_PATH, 'utf8'));
    if (parsed && parsed.day === yandexQuotaState.day) {
      yandexQuotaState = {
        day: parsed.day,
        total: Math.max(0, Math.min(YANDEX_DAILY_LIMIT, Number(parsed.total) || 0)),
        sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {}
      };
    }
  } catch (_error) {
    // 首次运行或配额文件损坏时从当前莫斯科自然日重新计数。
  }
}

function currentYandexQuota() {
  const used = yandexQuotaState.day === yandexQuotaDay()
    ? Math.max(0, Math.min(YANDEX_DAILY_LIMIT, Number(yandexQuotaState.total) || 0))
    : 0;
  return { used, remaining: Math.max(0, YANDEX_DAILY_LIMIT - used) };
}

function normalizeYandexSessionId(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9_-]{16,96}$/.test(text) ? text : '';
}

function yandexQuotaHash(value) {
  return crypto.createHmac('sha256', YANDEX_MAPS_API_KEY)
    .update(String(value || ''))
    .digest('base64url')
    .slice(0, 32);
}

async function grantYandexMapAccess(ip, sessionId) {
  const day = yandexQuotaDay();
  if (yandexQuotaState.day !== day) yandexQuotaState = emptyYandexQuotaState();
  const normalizedIp = cleanClientIp(ip) || 'unknown';
  const sessionKey = yandexQuotaHash(`session:${normalizedIp}:${sessionId}`);
  if (yandexQuotaState.sessions[sessionKey]) {
    return {
      ok: true,
      used: yandexQuotaState.total,
      remaining: Math.max(0, YANDEX_DAILY_LIMIT - yandexQuotaState.total),
      deduplicated: true
    };
  }
  if (yandexQuotaState.total >= YANDEX_DAILY_LIMIT) {
    return {
      ok: false,
      code: 'quota_exhausted',
      fallback: 'google',
      used: YANDEX_DAILY_LIMIT,
      remaining: 0,
      message: 'Yandex 地图今日 100 次授权额度已用完'
    };
  }
  yandexQuotaState.total += 1;
  yandexQuotaState.sessions[sessionKey] = Date.now();
  await saveYandexQuota();
  return {
    ok: true,
    used: yandexQuotaState.total,
    remaining: Math.max(0, YANDEX_DAILY_LIMIT - yandexQuotaState.total),
    deduplicated: false
  };
}

function saveYandexQuota() {
  const snapshot = JSON.stringify(yandexQuotaState, null, 2);
  yandexQuotaSavePromise = yandexQuotaSavePromise.then(async () => {
    await fs.promises.mkdir(path.dirname(YANDEX_QUOTA_PATH), { recursive: true });
    const temporaryPath = `${YANDEX_QUOTA_PATH}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryPath, snapshot, { encoding: 'utf8', mode: 0o600 });
    await fs.promises.rename(temporaryPath, YANDEX_QUOTA_PATH);
  }).catch(error => {
    console.warn('Yandex 地图配额无法写入磁盘:', error.message);
  });
  return yandexQuotaSavePromise;
}

function publicOrigin(req) {
  if (isLoopbackRequest(req)) {
    const host = String(req && req.headers && req.headers.host || '').trim();
    if (host) return `${requestIsSecure(req) ? 'https' : 'http'}://${host}`;
  }
  if (PUBLIC_ORIGIN) return PUBLIC_ORIGIN;
  const forwardedProto = String(req && req.headers && req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || (req && req.protocol) || 'http';
  const host = req && req.get && req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function amapServiceHost(req) {
  return `${publicOrigin(req)}${AMAP_SERVICE_PREFIX}`;
}

function proxyAmapService(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: '高德地图代理仅支持读取请求' });
    return;
  }
  const incoming = new URL(req.originalUrl, 'http://amap-proxy.invalid');
  const rawPath = incoming.pathname.slice(AMAP_SERVICE_PREFIX.length) || '/';
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('\\') || rawPath.length > 1024 || incoming.search.length > 4096) {
    res.status(400).json({ error: '高德地图代理路径无效' });
    return;
  }
  const jsonpCallback = incoming.searchParams.get('callback');
  if (jsonpCallback && !/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(jsonpCallback)) {
    res.status(400).json({ error: '高德地图回调参数无效' });
    return;
  }
  if (!AMAP_SECURITY_JSCODE) {
    res.status(503).json({ error: '高德地图安全代理未配置' });
    return;
  }
  const target = new URL(rawPath.startsWith('/v4/map/styles') ? 'https://webapi.amap.com' : 'https://restapi.amap.com');
  target.pathname = rawPath;
  for (const [key, value] of incoming.searchParams) target.searchParams.append(key, value);
  target.searchParams.set('jscode', AMAP_SECURITY_JSCODE);

  const upstream = https.request({
    hostname: target.hostname,
    path: `${target.pathname}${target.search}`,
    method: req.method,
    headers: {
      'User-Agent': 'china-earthquake-live-screen/1.0',
      'Referer': `${PUBLIC_ORIGIN}/`
    },
    timeout: 8000
  }, response => {
    const contentLength = Number(response.headers['content-length'] || 0);
    if (contentLength > 10 * 1024 * 1024) {
      response.destroy();
      res.status(502).json({ error: '高德地图服务响应过大' });
      return;
    }
    res.status(response.statusCode || 502);
    ['content-type', 'cache-control', 'expires'].forEach(header => {
      const value = response.headers[header];
      if (value) res.setHeader(header, value);
    });
    if (jsonpCallback) res.type('application/javascript');
    response.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ error: '高德地图服务暂不可用' });
  });
  res.on('close', () => upstream.destroy());
  upstream.end();
}

function ensureSourceState(source) {
  if (!sourceStates.has(source.key)) {
    sourceStates.set(source.key, {
      key: source.key,
      label: source.label,
      url: source.url,
      status: 'closed',
      retryCount: 0,
      reconnectTimer: null,
      ws: null,
      enabled: false,
      lastError: '',
      lastMessageAt: '',
      connectedAt: '',
      everConnected: false,
      reconnectFailures: [],
      cachedEvents: []
    });
  }
  return sourceStates.get(source.key);
}

function publicState(state) {
  return {
    key: state.key,
    label: state.label,
    url: state.url,
    status: state.status,
    retryCount: state.retryCount,
    lastError: state.lastError,
    lastMessageAt: state.lastMessageAt,
    connectedAt: state.connectedAt
  };
}

function allSourceStates() {
  return ALL_SOURCES.map(source => publicState(ensureSourceState(source)));
}

function clientFilter(client) {
  return client.filter || DEFAULT_FILTER;
}

function filteredEvents(filter) {
  const events = [];
  for (const event of recentEvents) events.push(event);
  for (const state of sourceStates.values()) {
    for (const event of state.cachedEvents || []) events.push(event);
  }
  for (const event of chinaHistoryCache.events || []) events.push(event);
  return mergeEarthquakeEventsList(events)
    .filter(event => matchesArea(event, filter.country, filter.region))
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, HISTORY_CACHE_LIMIT);
}

function cachedChinaEvents(filter, limit) {
  return (chinaHistoryCache.events || [])
    .filter(event => matchesArea(event, filter.country, filter.region))
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, limit);
}

function loadChinaHistoryCache() {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_CACHE_PATH, 'utf8'));
    chinaHistoryCache = {
      updatedAt: Number(data.updatedAt) || 0,
      events: normalizeHistoryCacheEvents(Array.isArray(data.events) ? data.events : [])
    };
  } catch (_error) {
    chinaHistoryCache = { updatedAt: 0, events: [] };
  }
}

function normalizeHistoryCacheEvents(events) {
  const normalized = [];
  for (const event of events || []) {
    if (!isRealEarthquake(event) || !matchesArea(event, 'CN_MAINLAND', 'all')) continue;
    const eventKey = event.eventKey || getEventKey(event);
    normalized.push(mergeWithKnownEvent({ ...event, eventKey, isHistory: true, isLive: false }));
  }
  return mergeEarthquakeEventsList(normalized)
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, HISTORY_CACHE_LIMIT);
}

function normalizeSourceCacheEvents(events) {
  const normalized = [];
  for (const event of events || []) {
    if (!isRealEarthquake(event)) continue;
    const eventKey = event.eventKey || getEventKey(event);
    normalized.push({ ...event, eventKey, isHistory: true, isLive: false });
  }
  return mergeEarthquakeEventsList(normalized)
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, HISTORY_CACHE_LIMIT);
}

function mergeSourceCache(source, events) {
  const state = ensureSourceState(source);
  const incoming = (events || []).map(event => mergeWithKnownEvent(event));
  state.cachedEvents = normalizeSourceCacheEvents((state.cachedEvents || []).concat(incoming));
}

async function saveChinaHistoryCache() {
  chinaHistoryCache = {
    updatedAt: Number(chinaHistoryCache.updatedAt) || Date.now(),
    events: normalizeHistoryCacheEvents(chinaHistoryCache.events)
  };
  await fs.promises.mkdir(path.dirname(HISTORY_CACHE_PATH), { recursive: true });
  await fs.promises.writeFile(HISTORY_CACHE_PATH, JSON.stringify(chinaHistoryCache, null, 2), 'utf8');
}

function loadDebugPassword() {
  const configured = String(process.env.DEBUG_PASSWORD || '');
  if (!debugPasswordPolicyError(configured)) {
    debugPassword = configured;
    debugPasswordManagedByEnv = true;
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(DEBUG_PASSWORD_PATH, 'utf8'));
    const stored = String(data.password || '');
    if (!debugPasswordPolicyError(stored)) {
      debugPassword = stored;
      return;
    }
  } catch (_error) {
    // 首次启动时生成独立密码。
  }
  debugPassword = `Q!${crypto.randomBytes(18).toString('base64url')}7`;
  fs.mkdirSync(path.dirname(DEBUG_PASSWORD_PATH), { recursive: true });
  fs.writeFileSync(DEBUG_PASSWORD_PATH, JSON.stringify({ password: debugPassword }, null, 2), { encoding: 'utf8', mode: 0o600 });
  console.warn(`已生成随机调试密码，请在服务器文件 ${DEBUG_PASSWORD_PATH} 中查看并妥善保管。`);
}

function debugPasswordPolicyError(value) {
  const password = String(value || '');
  if (password.length < 8 || password.length > 128) return '新密码需要 8 至 128 位';
  const missing = [];
  if (!/[A-Z]/.test(password)) missing.push('至少 1 个大写字母');
  if (!/[0-9]/.test(password)) missing.push('至少 1 个数字');
  if (!/[^A-Za-z0-9\s]/.test(password)) missing.push('至少 1 个特殊符号（例如 @）');
  return missing.length ? `新密码还需要：${missing.join('、')}` : '';
}

async function saveDebugPassword() {
  await saveDebugPasswordValue(debugPassword);
}

async function saveDebugPasswordValue(value) {
  await fs.promises.mkdir(path.dirname(DEBUG_PASSWORD_PATH), { recursive: true });
  const temporaryPath = `${DEBUG_PASSWORD_PATH}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify({ password: value }, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.promises.rename(temporaryPath, DEBUG_PASSWORD_PATH);
}

async function removeLocalEnvDebugPassword(expectedPassword) {
  try {
    const lines = (await fs.promises.readFile(LOCAL_ENV_PATH, 'utf8')).split(/\r?\n/);
    const assignments = lines.map(parseEnvAssignment);
    const active = assignments.find(item => item && item.key === 'DEBUG_PASSWORD');
    if (!active || !safeSecretEqual(active.value, expectedPassword)) return false;
    const retained = lines.filter((line, index) => {
      const assignment = assignments[index];
      return !assignment || assignment.key !== 'DEBUG_PASSWORD';
    });
    const temporaryPath = `${LOCAL_ENV_PATH}.${process.pid}.tmp`;
    const content = retained.join('\n').replace(/\n*$/, '\n');
    await fs.promises.writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
    await fs.promises.rename(temporaryPath, LOCAL_ENV_PATH);
    return true;
  } catch (error) {
    console.warn('调试密码环境配置迁移失败:', error.message);
    return false;
  }
}

function safeSecretEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function recordDebugAudit(action, req, ok) {
  try {
    let data = { resetAt: Date.now(), records: [] };
    try {
      data = JSON.parse(await fs.promises.readFile(DEBUG_AUDIT_PATH, 'utf8'));
    } catch (_error) {
      // 没有审计文件时从当前周期开始。
    }
    if (!Number(data.resetAt) || Date.now() - Number(data.resetAt) >= DEBUG_AUDIT_RESET_MS) {
      data = { resetAt: Date.now(), records: [] };
    }
    data.records = (Array.isArray(data.records) ? data.records : []).slice(-199);
    data.records.push({
      time: new Date().toISOString(),
      action,
      ok: Boolean(ok),
      ip: clientIp(req)
    });
    await fs.promises.mkdir(path.dirname(DEBUG_AUDIT_PATH), { recursive: true });
    await fs.promises.writeFile(DEBUG_AUDIT_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.warn('调试审计保存失败:', error.message);
  }
}

function initPushSupport() {
  ensurePushSupport(true);
}

function ensurePushSupport(logMissing = false) {
  pushSupportError = '';
  if (!webPush) {
    pushSupportError = 'missing_dependency';
    if (logMissing) console.warn('后台推送未启用：缺少 web-push 依赖', webPushLoadError && webPushLoadError.message || '');
    return false;
  }
  if (PUSH_TRANSPORT.mode === 'invalid') {
    pushSupportError = 'invalid_transport';
    if (logMissing) console.warn('后台推送传输配置无效:', PUSH_TRANSPORT.error);
    return false;
  }
  try {
    if (!vapidKeys || !vapidKeys.publicKey || !vapidKeys.privateKey) {
      vapidKeys = loadVapidKeys();
    }
    webPush.setVapidDetails(vapidSubject(), vapidKeys.publicKey, vapidKeys.privateKey);
    if (!pushSubscriptionsLoaded) loadPushSubscriptions();
    return true;
  } catch (error) {
    pushSupportError = 'invalid_vapid';
    if (logMissing) console.warn('后台推送初始化失败:', error.message);
    return false;
  }
}

function pushSupportMessage() {
  if (pushSupportError === 'missing_dependency') return '服务端未安装 web-push，请在服务器项目目录执行 npm ci --omit=dev 后重启服务';
  if (pushSupportError === 'invalid_vapid') return '服务端 VAPID 配置无效，请检查 VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY 和 VAPID_SUBJECT';
  if (pushSupportError === 'invalid_transport') return PUSH_TRANSPORT.error || '后台推送传输配置无效';
  return '服务端后台推送尚未就绪，请检查依赖和 VAPID 配置';
}

function vapidSubject() {
  const subject = String(process.env.VAPID_SUBJECT || PUBLIC_ORIGIN || '').trim();
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(subject)) return subject;
  try {
    const url = new URL(subject);
    if (url.protocol === 'https:') return url.origin;
  } catch (_error) {
    // 使用公开站点地址作为稳定的 VAPID 联系信息。
  }
  return 'https://www.cnquake.xyz';
}

function loadVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY || process.env.VAPID_PRIVATE_KEY) {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      throw new Error('VAPID 公钥和私钥必须同时配置');
    }
    vapidKeysSource = 'environment';
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  try {
    const data = JSON.parse(fs.readFileSync(VAPID_KEYS_PATH, 'utf8'));
    if (data.publicKey && data.privateKey) {
      vapidKeysSource = 'file';
      return data;
    }
  } catch (_error) {
    // 继续生成本地密钥。
  }
  const keys = webPush.generateVAPIDKeys();
  try {
    fs.mkdirSync(path.dirname(VAPID_KEYS_PATH), { recursive: true });
    fs.writeFileSync(VAPID_KEYS_PATH, JSON.stringify(keys, null, 2), { encoding: 'utf8', mode: 0o600 });
    vapidKeysSource = 'file';
  } catch (error) {
    vapidKeysSource = 'memory';
    console.warn('VAPID 密钥无法写入磁盘，本次进程将使用内存密钥:', error.message);
  }
  return keys;
}

function loadPushSubscriptions() {
  pushSubscriptionsLoaded = true;
  try {
    const records = JSON.parse(fs.readFileSync(PUSH_SUBSCRIPTIONS_PATH, 'utf8'));
    for (const record of Array.isArray(records) ? records : []) {
      const subscription = normalizePushSubscription(record && record.subscription);
      if (subscription && pushSubscriptions.size < MAX_PUSH_SUBSCRIPTIONS) {
        pushSubscriptions.set(subscription.endpoint, {
          subscription,
          threshold: clampPushThreshold(record.threshold),
          area: sanitizePushArea(record.area),
          userLocation: readUserLocation(record.userLocation),
          clientPath: sanitizePushClientPath(record.clientPath),
          updatedAt: record.updatedAt || new Date().toISOString()
        });
      }
    }
  } catch (_error) {
    pushSubscriptions.clear();
  }
}

async function savePushSubscriptions() {
  const snapshot = JSON.stringify(Array.from(pushSubscriptions.values()), null, 2);
  pushSavePromise = pushSavePromise.then(async () => {
    const temporaryPath = `${PUSH_SUBSCRIPTIONS_PATH}.${process.pid}.tmp`;
    await fs.promises.mkdir(path.dirname(PUSH_SUBSCRIPTIONS_PATH), { recursive: true });
    await fs.promises.writeFile(temporaryPath, snapshot, { encoding: 'utf8', mode: 0o600 });
    await fs.promises.rename(temporaryPath, PUSH_SUBSCRIPTIONS_PATH);
  }).catch(error => {
    console.warn('推送订阅无法写入磁盘，本次进程将使用内存订阅:', error.message);
  });
  return pushSavePromise;
}

function normalizePushSubscription(input) {
  const endpoint = normalizePushEndpoint(input && input.endpoint);
  const p256dh = String(input && input.keys && input.keys.p256dh || '').trim();
  const auth = String(input && input.keys && input.keys.auth || '').trim();
  if (!endpoint || !isBase64UrlValue(p256dh, 32, 256) || !isBase64UrlValue(auth, 8, 128)) return null;
  const expirationTime = Number(input && input.expirationTime);
  return {
    endpoint,
    expirationTime: Number.isFinite(expirationTime) && expirationTime > 0 ? expirationTime : null,
    keys: { p256dh, auth }
  };
}

function normalizePushEndpoint(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 2048) return '';
  try {
    const url = new URL(text);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !hostname) return '';
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return '';
    if (net.isIP(hostname) && !isPublicIp(hostname)) return '';
    if (!isAllowedPushServiceHost(hostname)) return '';
    return url.href;
  } catch (_error) {
    return '';
  }
}

function isAllowedPushServiceHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'fcm.googleapis.com' ||
    host.endsWith('.fcm.googleapis.com') ||
    host === 'android.googleapis.com' ||
    host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') ||
    host === 'web.push.apple.com' ||
    host.endsWith('.push.apple.com') ||
    host.endsWith('.notify.windows.com') ||
    host.endsWith('.wns.windows.com');
}

function isBase64UrlValue(value, minLength, maxLength) {
  return value.length >= minLength && value.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(value);
}

function createPushHttpsAgent() {
  return new https.Agent({
    keepAlive: true,
    maxSockets: 32,
    minVersion: 'TLSv1.2',
    lookup(hostname, options, callback) {
      const lookupOptions = {
        family: options && options.family || 0,
        hints: options && options.hints || 0,
        all: true
      };
      dns.lookup(hostname, lookupOptions, (error, addresses) => {
        if (error) {
          callback(error);
          return;
        }
        const publicAddresses = (addresses || [])
          .filter(item => isPublicIp(item.address))
          .sort((left, right) => addressFamilyPriority(left.family) - addressFamilyPriority(right.family));
        if (!publicAddresses.length) {
          callback(new Error('推送服务地址解析到非公网 IP'));
          return;
        }
        if (options && options.all) callback(null, publicAddresses);
        else callback(null, publicAddresses[0].address, publicAddresses[0].family);
      });
    }
  });
}

function normalizeDnsResultOrder(value) {
  return String(value || '').trim().toLowerCase() === 'verbatim' ? 'verbatim' : 'ipv4first';
}

function addressFamilyPriority(family) {
  if (DNS_RESULT_ORDER === 'ipv4first') return Number(family) === 4 ? 0 : 1;
  return 0;
}

function resolvePushTransport() {
  const relayUrlValue = String(process.env.PUSH_RELAY_URL || '').trim();
  const relaySecret = String(process.env.PUSH_RELAY_SECRET || '').trim();
  if (relayUrlValue || relaySecret) {
    const relayUrl = normalizePushRelayUrl(relayUrlValue);
    if (!relayUrl || relaySecret.length < 32 || relaySecret.length > 256) {
      return {
        mode: 'invalid',
        error: 'PUSH_RELAY_URL 必须是公网 HTTPS 地址，PUSH_RELAY_SECRET 必须为 32 至 256 位随机字符串'
      };
    }
    return { mode: 'relay', relayUrl, relaySecret };
  }

  const proxyCandidates = [
    ['PUSH_PROXY_URL', process.env.PUSH_PROXY_URL],
    ['HTTPS_PROXY', process.env.HTTPS_PROXY],
    ['https_proxy', process.env.https_proxy]
  ];
  const configuredProxy = proxyCandidates.find(([, value]) => String(value || '').trim());
  if (configuredProxy) {
    const proxyUrl = normalizePushProxyUrl(configuredProxy[1]);
    if (!proxyUrl) {
      return {
        mode: 'invalid',
        error: `${configuredProxy[0]} 必须是有效的 HTTP 或 HTTPS 代理地址`
      };
    }
    return { mode: 'proxy', proxyUrl, source: configuredProxy[0] };
  }
  return { mode: 'direct' };
}

function normalizePushProxyUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.hash) return '';
    return url.href;
  } catch (_error) {
    return '';
  }
}

function normalizePushRelayUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !hostname || url.hash) return '';
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return '';
    if (net.isIP(hostname) && !isPublicIp(hostname)) return '';
    return url.href;
  } catch (_error) {
    return '';
  }
}

function publicPushTransport() {
  const transport = {
    mode: PUSH_TRANSPORT.mode,
    proxyConfigured: PUSH_TRANSPORT.mode === 'proxy',
    relayConfigured: PUSH_TRANSPORT.mode === 'relay'
  };
  if (PUSH_TRANSPORT.mode === 'proxy') transport.proxySource = PUSH_TRANSPORT.source || 'PUSH_PROXY_URL';
  if (PUSH_TRANSPORT.mode === 'relay') {
    const relayUrl = new URL(PUSH_TRANSPORT.relayUrl);
    transport.relayHost = relayUrl.hostname;
    transport.relayPath = relayUrl.pathname || '/';
    transport.relayProbe = pushRelayProbe ? { ...pushRelayProbe } : null;
  }
  return transport;
}

function pushEndpointHash(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint || '')).digest('hex');
}

function isPushTestId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function safeText(value, maxLength = 160) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function sanitizePushTestEvent(input) {
  const magnitude = Number(input && input.magnitude);
  if (!Number.isFinite(magnitude) || magnitude < 0 || magnitude > 10) return null;
  const latitude = Number(input && input.latitude);
  const longitude = Number(input && input.longitude);
  const hasCoordinates = isUsableCoordinate(latitude, longitude);
  const depth = Number(input && input.depth);
  const intensity = Number(input && input.intensity);
  const now = new Date().toISOString();
  const originTimestamp = Date.parse(input && input.originTime);
  const receivedTimestamp = Date.parse(input && input.receivedAt);
  const eventId = `push-test-${Date.now()}`;
  return {
    eventKey: eventId,
    eventId,
    source: 'push_test',
    sourceLabel: '后台推送测试',
    location: safeText(input && input.location, 160) || '测试地震',
    magnitude,
    depth: Number.isFinite(depth) && depth >= 0 && depth <= 1000 ? depth : null,
    latitude: hasCoordinates ? latitude : null,
    longitude: hasCoordinates ? longitude : null,
    intensity: Number.isFinite(intensity) && intensity >= 1 && intensity <= 12 ? intensity : null,
    originTime: Number.isFinite(originTimestamp) ? new Date(originTimestamp).toISOString() : now,
    receivedAt: Number.isFinite(receivedTimestamp) ? new Date(receivedTimestamp).toISOString() : now,
    isHistory: false,
    isLive: true
  };
}

function sanitizePushClientPath(value) {
  return value === '/mobile.html' ? '/mobile.html' : '/';
}

function pushPresentationProfile(record) {
  return sanitizePushClientPath(record && record.clientPath) === '/mobile.html' ? 'mobile' : 'desktop';
}

function clampPushThreshold(value) {
  const number = Number(value);
  return [3, 4, 5, 6].includes(number) ? number : 3;
}

function sanitizePushArea(area = {}) {
  return {
    country: safeText(area.country || 'CN_MAINLAND', 32),
    countryName: safeText(area.countryName, 80),
    region: safeText(area.region || 'all', 48),
    regionName: safeText(area.regionName, 80),
    province: safeText(area.province || 'all', 48),
    provinceName: safeText(area.provinceName, 80),
    city: safeText(area.city || 'all', 48),
    cityName: safeText(area.cityName, 80),
    district: safeText(area.district || 'all', 48),
    districtName: safeText(area.districtName, 80)
  };
}

function pushMatchesArea(event, area) {
  const location = pushLocationText(event);
  if (!matchesArea(event, area.country || 'CN_MAINLAND', area.region || 'all')) return false;
  if ((area.country || 'CN_MAINLAND') !== 'CN_MAINLAND') return true;
  if (area.district !== 'all' && area.districtName) return adminNameMatches(location, area.districtName);
  if (area.city !== 'all' && area.cityName) return adminNameMatches(location, area.cityName);
  if (area.province !== 'all' && area.provinceName) return adminNameMatches(location, area.provinceName);
  return true;
}

function pushLocationText(event) {
  return standardizePlaceName([
    event && event.location,
    event && event.placeName,
    event && event.rawData && event.rawData.place,
    event && event.rawData && event.rawData.LOCATION_C
  ].filter(Boolean).join(' '));
}

function adminNameMatches(location, name) {
  const text = String(location || '').replace(/\s/g, '');
  return adminNameCandidates(name).some(candidate => candidate && text.includes(candidate));
}

function adminNameCandidates(name) {
  const compact = standardizePlaceName(name).replace(/\s/g, '');
  const stripped = compact.replace(/(特别行政区|自治区|自治州|地区|省|市|县|区|旗|盟)$/u, '');
  return Array.from(new Set([compact, stripped])).filter(Boolean);
}

function pushNotificationCopy(event, userLocation, phase = 'initial') {
  const magnitude = Number(event && event.magnitude) || 0;
  const location = standardizePlaceName(event && event.location) || '未知震中';
  const magText = Number.isFinite(magnitude) ? `${magnitude.toFixed(1)}级` : '震级未知';
  const depth = Number(event && event.depth);
  const depthText = Number.isFinite(depth) ? `，深度${Math.round(depth)}公里` : '';
  const epicenter = intensityColor(estimateEpicenterIntensity(event));
  const local = intensityColor(estimateLocalIntensity(event, userLocation));
  const waves = userLocation ? estimateWaveCountdowns(event, userLocation) : { p: null, s: null };
  const arrival = userLocation ? `，纵波${formatCountdown(waves.p, '已到达')}，横波${formatCountdown(waves.s, '已到达')}` : '';
  const intensityText = `，震中烈度${epicenter.label}，本地烈度${local.label}`;
  const body = `${location}${depthText}${intensityText}${arrival}。`;
  if (phase === 'official') {
    return {
      title: `正式测定更新：${magText}`,
      body: `中国地震台网正式测定：${body}本次通知仅更新震级、震中和测定信息，请以官方发布为准。`
    };
  }
  if (magnitude >= 6 || Number(local.level) >= 7) return { title: `紧急地震提醒：${magText}`, body: `${body}请立即避险，远离玻璃、悬挂物和危险建筑。` };
  if (magnitude >= 5 || Number(local.level) >= 5) return { title: `强震提醒：${magText}`, body: `${body}请尽快避险，注意保护头部并关注官方信息。` };
  if (magnitude >= 4 || Number(local.level) >= 3) return { title: `明显地震提醒：${magText}`, body: `${body}可能有明显震感，请注意避险并留意后续信息。` };
  return { title: `地震提醒：${magText}`, body: `${body}请留意周边环境，注意安全。` };
}

function pushEarthquakeNotification(event, phase = 'initial') {
  if (!ensurePushSupport() || !event || event.isHistory) return;
  const magnitude = Number(event.magnitude);
  if (!Number.isFinite(magnitude)) return;
  const key = event.eventKey || getEventKey(event);
  const deliveries = [];
  let skipped = 0;
  for (const [endpoint, record] of pushSubscriptions) {
    const firstSent = sentPushKeys.has(`${endpoint}:${key}:initial`);
    const areaMatched = pushMatchesArea(event, record.area);
    if (phase === 'official') {
      if (!firstSent && (magnitude < record.threshold || !areaMatched)) {
        skipped += 1;
        continue;
      }
    } else if (magnitude < record.threshold || !areaMatched) {
      skipped += 1;
      continue;
    }
    deliveries.push(sendPushWithRetry(endpoint, record, event, false, phase));
  }
  const startedAt = new Date().toISOString();
  lastPushDispatch = {
    startedAt,
    completedAt: deliveries.length ? null : startedAt,
    phase,
    subscriptions: pushSubscriptions.size,
    matched: deliveries.length,
    skipped,
    sent: 0,
    failed: 0
  };
  Promise.all(deliveries).then(results => {
    lastPushDispatch = {
      ...lastPushDispatch,
      completedAt: new Date().toISOString(),
      sent: results.filter(result => result.ok && !result.duplicate).length,
      failed: results.filter(result => !result.ok).length
    };
    if (lastPushDispatch.failed) {
      console.warn(`后台推送部分失败: ${lastPushDispatch.sent} 成功，${lastPushDispatch.failed} 失败`);
    }
  }).catch(error => {
    lastPushDispatch = { ...lastPushDispatch, completedAt: new Date().toISOString(), failed: deliveries.length };
    console.warn('后台推送批次失败:', error.message);
  });
  while (sentPushKeys.size > 1000) sentPushKeys.delete(sentPushKeys.values().next().value);
}

function prunePushTestResults() {
  const cutoff = Date.now() - PUSH_TEST_RESULT_TTL_MS;
  for (const [testId, result] of pushTestResults) {
    if (Number(result && result.createdAt) < cutoff) pushTestResults.delete(testId);
  }
  while (pushTestResults.size > MAX_PUSH_TEST_RESULTS) {
    pushTestResults.delete(pushTestResults.keys().next().value);
  }
}

function completePushTest(testId, delivery) {
  const previous = pushTestResults.get(testId);
  if (!previous) return;
  if (delivery && delivery.ok) {
    if (previous.deviceAcknowledged) {
      pushTestResults.set(testId, {
        ...previous,
        state: 'completed',
        completedAt: Date.now(),
        ok: true,
        code: 'device_acknowledged',
        message: PUSH_NOTIFICATION_CREATED_MESSAGE,
        providerAccepted: true,
        providerStatus: Number(delivery.providerStatus) || 0,
        provider: safeText(delivery.provider, 32) || previous.provider,
        transport: safeText(delivery.transport, 16) || previous.transport,
        diagnosticId: safeText(delivery.diagnosticId, 64)
      });
      return;
    }
    pushTestResults.set(testId, {
      ...previous,
      state: 'provider_accepted',
      acceptedAt: Date.now(),
      ok: true,
      code: 'provider_accepted',
      message: '浏览器推送服务已接受消息，正在等待当前设备确认。',
      providerAccepted: true,
      providerStatus: Number(delivery.providerStatus) || 0,
      provider: safeText(delivery.provider, 32) || previous.provider,
      transport: safeText(delivery.transport, 16) || previous.transport,
      diagnosticId: safeText(delivery.diagnosticId, 64)
    });
    const timeout = setTimeout(() => {
      const current = pushTestResults.get(testId);
      if (!current || current.state !== 'provider_accepted') return;
      pushTestResults.set(testId, {
        ...current,
        state: 'completed',
        completedAt: Date.now(),
        ok: false,
        code: 'device_ack_timeout',
        message: '推送服务已接受消息，但当前设备未确认显示通知。请检查浏览器后台运行权限、系统通知设置和专注模式后重试。',
        deviceAcknowledged: false
      });
    }, PUSH_TEST_DEVICE_ACK_TIMEOUT_MS);
    if (timeout.unref) timeout.unref();
    return;
  }
  pushTestResults.set(testId, {
    ...previous,
    state: 'completed',
    completedAt: Date.now(),
    ok: Boolean(delivery && delivery.ok),
    code: safeText(delivery && delivery.code, 64),
    message: safeText(delivery && delivery.message, 240),
    resetSubscription: Boolean(delivery && delivery.resetSubscription),
    provider: safeText(delivery && delivery.provider, 32) || previous.provider,
    transport: safeText(delivery && delivery.transport, 16) || previous.transport,
    diagnosticId: safeText(delivery && delivery.diagnosticId, 64)
  });
}

async function sendPushWithRetry(endpoint, record, event, force, phase = 'initial', testId = '') {
  let result = null;
  const maxAttempts = force ? 1 : 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result = await sendPushToRecord(endpoint, record, event, force, phase, testId);
    if (result.ok || !result.retryable || attempt === maxAttempts) return result;
    await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 1000 : 3000));
  }
  return result || { ok: false, code: 'push_delivery_failed', message: '后台推送发送失败' };
}

async function sendPushToRecord(endpoint, record, event, force, phase = 'initial', testId = '') {
  const key = event.eventKey || getEventKey(event);
  const validTestId = isPushTestId(testId) ? testId : '';
  const sentKey = `${endpoint}:${key}:${phase}`;
  if (!force && sentPushKeys.has(sentKey)) return { ok: true, duplicate: true };
  sentPushKeys.add(sentKey);
  const copy = pushNotificationCopy(event, record.userLocation, phase);
  const presentationProfile = pushPresentationProfile(record);
  const payload = JSON.stringify({
    title: copy.title,
    body: copy.body,
    icon: '/app-icon.png',
    tag: validTestId ? `quake-test-${validTestId}` : `${key}-${phase}`,
    url: sanitizePushClientPath(record.clientPath),
    magnitude: Number(event.magnitude) || null,
    timestamp: validTestId ? new Date().toISOString() : event.originTime || event.receivedAt || new Date().toISOString(),
    requireInteraction: Boolean(validTestId) || Number(event.magnitude) >= 5,
    presentationProfile,
    vibrate: presentationProfile === 'mobile' ? [280, 120, 280] : undefined,
    testId: validTestId
  });
  try {
    const response = await deliverWebPush(record.subscription, payload, {
      TTL: validTestId ? 120 : 3600,
      urgency: 'high',
      topic: crypto.createHash('sha256').update(`${key}:${phase}:${validTestId}`).digest('base64url').slice(0, 32),
      timeout: PUSH_SEND_TIMEOUT_MS
    });
    const provider = pushServiceInfo(endpoint);
    return {
      ok: true,
      providerAccepted: true,
      providerStatus: Number(response && response.statusCode) || 0,
      provider: provider.key,
      transport: PUSH_TRANSPORT.mode,
      diagnosticId: safeText(response && response.diagnosticId, 64)
    };
  } catch (error) {
    sentPushKeys.delete(sentKey);
    const failure = classifyPushDeliveryError(error, endpoint);
    if (failure.resetSubscription) {
      pushSubscriptions.delete(endpoint);
      await savePushSubscriptions();
    } else {
      console.warn(
        `后台推送发送失败 [${failure.provider || 'unknown'}/${failure.transport || PUSH_TRANSPORT.mode}]:`,
        failure.code,
        error && error.message || error
      );
    }
    return { ok: false, ...failure };
  }
}

async function deliverWebPush(subscription, payload, options) {
  if (PUSH_TRANSPORT.mode === 'relay') {
    return sendWebPushThroughRelay(subscription, payload, options);
  }
  const transportOptions = { ...options };
  if (PUSH_TRANSPORT.mode === 'proxy') transportOptions.proxy = PUSH_TRANSPORT.proxyUrl;
  else transportOptions.agent = pushHttpsAgent;
  return webPush.sendNotification(subscription, payload, transportOptions);
}

async function sendWebPushThroughRelay(subscription, payload, options) {
  const requestDetails = webPush.generateRequestDetails(subscription, payload, options);
  const relayBody = JSON.stringify({
    endpoint: requestDetails.endpoint,
    headers: requestDetails.headers,
    body: Buffer.from(requestDetails.body || '').toString('base64')
  });
  const relayHeaders = signedPushRelayHeaders(relayBody);
  try {
    const response = await requestPushRelay(PUSH_TRANSPORT.relayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'cnquake-push-relay-client/1.0',
        ...relayHeaders
      },
      body: relayBody,
      timeoutMs: PUSH_SEND_TIMEOUT_MS + 2000
    });
    const text = response.body;
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = null;
    }
    if (!response.ok || !data || !Number.isInteger(Number(data.status))) {
      const relayError = new Error(
        data && data.message || `推送中继返回 HTTP ${response.status}`
      );
      relayError.code = response.ok ? 'PUSH_RELAY_INVALID_RESPONSE' : `PUSH_RELAY_HTTP_${response.status}`;
      relayError.pushTransport = 'relay';
      relayError.relayRequestId = safeText(data && data.requestId, 64);
      relayError.relayCode = safeText(data && data.code, 64);
      throw relayError;
    }
    if (!data.ok) {
      const providerError = new Error(`浏览器推送服务返回 HTTP ${data.status}`);
      providerError.statusCode = Number(data.status);
      providerError.body = safeText(data.body, 500);
      providerError.pushTransport = 'relay';
      providerError.relayRequestId = safeText(data.requestId, 64);
      providerError.relayCode = safeText(data.code, 64);
      throw providerError;
    }
    return {
      statusCode: Number(data.status),
      body: safeText(data.body, 500),
      diagnosticId: safeText(data.requestId, 64)
    };
  } catch (error) {
    if (error && !error.pushTransport) error.pushTransport = 'relay';
    if (!pushRelayProbe || pushRelayProbe.ok !== true) refreshPushRelayProbe(false).catch(() => {});
    throw error;
  }
}

function requestPushRelay(value, options = {}) {
  const target = value instanceof URL ? new URL(value.href) : new URL(String(value));
  const configured = new URL(PUSH_TRANSPORT.relayUrl);
  if (target.protocol !== 'https:' || target.origin !== configured.origin) {
    const error = new Error('推送中继请求地址与已配置来源不一致');
    error.code = 'PUSH_RELAY_URL_MISMATCH';
    return Promise.reject(error);
  }

  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body == null ? '' : String(options.body);
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (body && !Object.keys(headers).some(name => name.toLowerCase() === 'content-length')) {
    headers['Content-Length'] = Buffer.byteLength(body);
  }
  const timeoutMs = Math.min(
    32000,
    Math.max(1000, Number(options.timeoutMs || PUSH_RELAY_PROBE_TIMEOUT_MS) || PUSH_RELAY_PROBE_TIMEOUT_MS)
  );

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
      agent: pushHttpsAgent,
      rejectUnauthorized: true
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > PUSH_RELAY_MAX_RESPONSE_BYTES) {
          const error = new Error('推送中继响应超过允许大小');
          error.code = 'PUSH_RELAY_RESPONSE_TOO_LARGE';
          response.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', error => finish(reject, error));
      response.once('end', () => {
        const status = Number(response.statusCode) || 0;
        finish(resolve, {
          ok: status >= 200 && status < 300,
          status,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    request.setTimeout(timeoutMs, () => {
      const error = new Error(`推送中继连接超时（${timeoutMs}ms）`);
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    });
    request.once('error', error => finish(reject, error));
    request.end(body || undefined);
  });
}

function signedPushRelayHeaders(body) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto
    .createHmac('sha256', PUSH_TRANSPORT.relaySecret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return {
    'X-Cnquake-Timestamp': timestamp,
    'X-Cnquake-Signature': signature
  };
}

async function refreshPushRelayProbe(force = false) {
  if (PUSH_TRANSPORT.mode !== 'relay') return null;
  const now = Date.now();
  if (!force && (pushRelayProbe && pushRelayProbe.state === 'checking' || now - pushRelayProbeStartedAt < 30000)) {
    return pushRelayProbe;
  }
  pushRelayProbeStartedAt = now;
  const relayUrl = new URL(PUSH_TRANSPORT.relayUrl);
  pushRelayProbe = {
    state: 'checking',
    ok: false,
    host: relayUrl.hostname,
    checkedAt: new Date(now).toISOString()
  };
  try {
    const healthResponse = await requestPushRelay(new URL('/health', relayUrl), {
      timeoutMs: PUSH_RELAY_PROBE_TIMEOUT_MS
    });
    const health = parseJsonObject(healthResponse.body);
    if (!healthResponse.ok || !health.ok) throw new Error(`中继健康接口返回 HTTP ${healthResponse.status}`);

    const probeBody = JSON.stringify({ probe: true });
    const probeResponse = await requestPushRelay(new URL('/diagnostics', relayUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'cnquake-push-relay-client/1.0',
        ...signedPushRelayHeaders(probeBody)
      },
      body: probeBody,
      timeoutMs: PUSH_RELAY_PROBE_TIMEOUT_MS
    });
    const probe = parseJsonObject(probeResponse.body);
    const authenticated = probeResponse.ok && probe.ok === true && probe.authenticated === true;
    pushRelayProbe = {
      state: authenticated ? 'ready' : 'failed',
      ok: authenticated,
      host: relayUrl.hostname,
      checkedAt: new Date().toISOString(),
      healthVersion: safeText(health.version, 32),
      authenticated,
      status: probeResponse.status,
      code: safeText(probe.code, 64),
      requestId: safeText(probe.requestId, 64)
    };
  } catch (error) {
    const codes = Array.from(pushErrorCodes(error));
    pushRelayProbe = {
      state: 'failed',
      ok: false,
      host: relayUrl.hostname,
      checkedAt: new Date().toISOString(),
      authenticated: false,
      code: safeText(codes[0] || error && error.name || 'relay_probe_failed', 64),
      message: safeText(error && error.message, 160)
    };
  }
  return pushRelayProbe;
}

function startPushRelayRecoveryMonitor() {
  if (PUSH_TRANSPORT.mode !== 'relay') return;
  const timer = setInterval(() => {
    if (pushRelayProbe && pushRelayProbe.ok === true) return;
    refreshPushRelayProbe(true).then(result => {
      if (result && result.ok) console.log(`后台推送中继已恢复: ${result.host}，签名配置一致`);
    }).catch(() => {});
  }, PUSH_RELAY_RETRY_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function pushServiceInfo(endpoint) {
  let hostname = '';
  try {
    hostname = new URL(String(endpoint || '')).hostname.toLowerCase();
  } catch (_error) {
    return { key: 'unknown', label: '浏览器厂商推送服务', hostPattern: '订阅端点域名' };
  }
  if (hostname === 'fcm.googleapis.com' || hostname.endsWith('.fcm.googleapis.com') || hostname === 'android.googleapis.com') {
    return { key: 'fcm', label: 'Google FCM', hostPattern: 'fcm.googleapis.com' };
  }
  if (hostname === 'updates.push.services.mozilla.com' || hostname.endsWith('.push.services.mozilla.com')) {
    return { key: 'mozilla', label: 'Mozilla Push', hostPattern: '*.push.services.mozilla.com' };
  }
  if (hostname === 'web.push.apple.com' || hostname.endsWith('.push.apple.com')) {
    return { key: 'apple', label: 'Apple Web Push', hostPattern: '*.push.apple.com' };
  }
  if (hostname.endsWith('.notify.windows.com') || hostname.endsWith('.wns.windows.com')) {
    return { key: 'wns', label: 'Microsoft Edge / WNS', hostPattern: '*.notify.windows.com' };
  }
  return { key: 'unknown', label: '浏览器厂商推送服务', hostPattern: hostname || '订阅端点域名' };
}

function pushErrorCodes(error, output = new Set(), depth = 0) {
  if (!error || depth > 4) return output;
  const code = safeText(error.code, 64).toUpperCase();
  if (code) output.add(code);
  if (error.cause && error.cause !== error) pushErrorCodes(error.cause, output, depth + 1);
  if (Array.isArray(error.errors)) {
    for (const nested of error.errors.slice(0, 8)) pushErrorCodes(nested, output, depth + 1);
  }
  return output;
}

function classifyPushDeliveryError(error, endpoint) {
  const statusCode = Number(error && error.statusCode);
  const codes = pushErrorCodes(error);
  const code = codes.values().next().value || '';
  const message = String(error && error.message || '');
  const service = pushServiceInfo(endpoint);
  const transport = safeText(error && error.pushTransport, 16) || PUSH_TRANSPORT.mode;
  const context = {
    provider: service.key,
    transport,
    diagnosticId: safeText(error && error.relayRequestId, 64)
  };
  if (statusCode === 404 || statusCode === 410) {
    return {
      ...context,
      httpStatus: 410,
      code: 'subscription_expired',
      message: '当前浏览器推送订阅已失效，请关闭后台推送后重新开启',
      resetSubscription: true
    };
  }
  if (statusCode === 401 || statusCode === 403) {
    return {
      ...context,
      httpStatus: 502,
      code: 'vapid_rejected',
      message: '浏览器推送服务拒绝了 VAPID 凭据，请检查服务器 VAPID 密钥是否与当前订阅一致'
    };
  }
  if (statusCode === 429) {
    return {
      ...context,
      httpStatus: 503,
      code: 'provider_rate_limited',
      message: '浏览器推送服务正在限流，请稍后再测试',
      retryable: true
    };
  }
  if (transport === 'relay' && Array.from(codes).some(item => item.startsWith('PUSH_RELAY_'))) {
    const relayStatus = code.match(/PUSH_RELAY_HTTP_(\d+)/);
    const relayMessage = relayStatus && relayStatus[1] === '401'
      ? 'Cloudflare 推送中继拒绝了请求，请确认 Worker 与服务器使用相同的 PUSH_RELAY_SECRET。'
      : relayStatus && relayStatus[1] === '502'
        ? `Cloudflare 推送中继无法连接 ${service.label}（${service.hostPattern}:443），请检查 Worker 出站状态。`
        : `Cloudflare 推送中继返回异常${relayStatus ? `（HTTP ${relayStatus[1]}）` : ''}，请检查 Worker 路由、WAF 和服务日志。`;
    const diagnosticSuffix = context.diagnosticId ? ` 诊断编号：${context.diagnosticId}。` : '';
    return {
      ...context,
      httpStatus: 502,
      code: code.toLowerCase(),
      message: `${relayMessage}${diagnosticSuffix}`,
      retryable: Boolean(relayStatus && Number(relayStatus[1]) >= 500)
    };
  }
  const networkCodes = new Set([
    'EAI_AGAIN',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'UND_ERR_CONNECT_TIMEOUT'
  ]);
  const isNetworkFailure = Array.from(codes).some(item => networkCodes.has(item)) ||
    /timed? ?out|network|socket|非公网 IP|connect|fetch failed|aborted/i.test(message);
  if (isNetworkFailure) {
    const relayFailed = transport === 'relay';
    const proxyFailed = transport === 'proxy';
    const deliveryMessage = relayFailed
      ? `服务器无法连接已配置的 Cloudflare 推送中继（${publicPushTransport().relayHost || '未知主机'}），请检查运行中服务的 PUSH_RELAY_URL、DNS 和 Worker 路由。目标推送服务为 ${service.label}。`
      : proxyFailed
        ? `服务器通过 PUSH_PROXY_URL 仍无法连接 ${service.label}，请检查代理出站规则及 ${service.hostPattern}:443。`
        : `服务器无法直连 ${service.label}（${service.hostPattern}:443）。这是服务器出站网络问题，不是浏览器通知权限；请放行该域名，或配置 PUSH_PROXY_URL / Cloudflare 推送中继。`;
    return {
      ...context,
      httpStatus: 502,
      code: code.toLowerCase() || 'push_network_unreachable',
      message: deliveryMessage,
      retryable: true
    };
  }
  return {
    ...context,
    httpStatus: 502,
    code: statusCode ? 'provider_http_' + statusCode : 'push_delivery_failed',
    message: statusCode
      ? '浏览器推送服务返回 HTTP ' + statusCode + '，请查看 earthquake-screen 服务日志'
      : '推送服务未接受测试消息，请查看 earthquake-screen 服务日志',
    retryable: statusCode >= 500
  };
}

function triggerChinaHistoryRefresh(force = false) {
  refreshChinaHistoryCache({ force }).catch(error => {
    console.warn('中国历史地震缓存刷新失败:', error.message);
  });
}

async function refreshChinaHistoryCache({ force = false } = {}) {
  if (chinaHistoryRefreshPromise) return chinaHistoryRefreshPromise;
  const freshEnough = Date.now() - Number(chinaHistoryCache.updatedAt || 0) < HISTORY_CACHE_INTERVAL_MS;
  if (!force && freshEnough && chinaHistoryCache.events.length) return chinaHistoryCache.events;
  chinaHistoryRefreshPromise = (async () => {
    const previousKeys = new Set((chinaHistoryCache.events || []).map(event => event.eventKey || getEventKey(event)));
    const events = await fetchLatestChinaHistoryEvents(force);
    if (events.length) {
      const nextEvents = normalizeHistoryCacheEvents(events);
      const changed = hasEventListChanged(previousKeys, nextEvents);
      chinaHistoryCache = { updatedAt: Date.now(), events: nextEvents };
      await saveChinaHistoryCache();
      if (changed) {
        notifyHistoryHooks(chinaHistoryCache.events);
        broadcastHistory();
      }
    }
    return chinaHistoryCache.events;
  })().finally(() => {
    chinaHistoryRefreshPromise = null;
  });
  return chinaHistoryRefreshPromise;
}

function hasEventListChanged(previousKeys, events) {
  if (!previousKeys.size) return Boolean(events.length);
  return (events || []).some(event => !previousKeys.has(event.eventKey || getEventKey(event)));
}

function allowUserHistoryRefresh(req) {
  const now = Date.now();
  const key = clientIp(req);
  const last = Number(userHistoryRefreshes.get(key) || 0);
  if (now - last < USER_FORCE_HISTORY_REFRESH_MS) return false;
  userHistoryRefreshes.set(key, now);
  if (userHistoryRefreshes.size > 1000) {
    for (const [itemKey, time] of userHistoryRefreshes) {
      if (now - Number(time) > USER_FORCE_HISTORY_REFRESH_MS) userHistoryRefreshes.delete(itemKey);
    }
    trimMapToSize(userHistoryRefreshes, 1000);
  }
  return true;
}

async function fetchLatestChinaHistoryEvents(force = false) {
  const raw = await fetchCencEqlist({ force });
  const now = Date.now();
  return normalizeCencList(raw)
    .filter(event => isRealEarthquake(event) && eventTime(event) <= now && matchesArea(event, 'CN_MAINLAND', 'all'))
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, HISTORY_CACHE_LIMIT)
    .map(event => ({
      ...event,
      isHistory: true,
      isLive: false,
      receivedAt: new Date().toISOString()
    }));
}

function notifyHistoryHooks(events) {
  for (const url of HISTORY_HOOK_URLS) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedAt: chinaHistoryCache.updatedAt, events })
    }).catch(error => console.warn(`历史地震挂钩通知失败 ${url}:`, error.message));
  }
}

function readUserLocation(input) {
  const lat = Number(input && input.lat);
  const lon = Number(input && (input.lon !== undefined ? input.lon : input.lng));
  if (!isUsableCoordinate(lat, lon)) return null;
  return { lat, lon, place: safeText((input && input.place) || '用户位置', 120) };
}

function withArrival(events, userLocation) {
  return (events || []).map(event => userLocation
    ? { ...event, arrival: estimateWaveCountdowns(event, userLocation) }
    : event);
}

async function fetchCencEqlist({ force = false } = {}) {
  const now = Date.now();
  if (!force && cencEqlistCache.data && now - cencEqlistCache.updatedAt < CENC_EQLIST_CACHE_MS) {
    return cencEqlistCache.data;
  }
  if (!force && cencEqlistCache.promise) return cencEqlistCache.promise;
  cencEqlistCache.promise = (async () => {
    const response = await fetch('https://api.wolfx.jp/cenc_eqlist.json', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'china-eq-dashboard/1.0'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      throw new Error('获取中国地震台网地震列表失败');
    }
    const data = await response.json();
    cencEqlistCache = { updatedAt: Date.now(), data, promise: null };
    return data;
  })().finally(() => {
    cencEqlistCache.promise = null;
  });
  return cencEqlistCache.promise;
}

function normalizeCencList(raw) {
  return Object.entries(raw || {})
    .filter(([key, value]) => key.startsWith('No') && value && typeof value === 'object')
    .map(([key, value]) => normalizeCencListEvent(key, value))
    .filter(event => Number.isFinite(event.originTimestamp));
}

function normalizeCencListEvent(key, value) {
  const originTime = value.time || value.OriginTime || '';
  const normalized = normalizeEarthquakeData({
    key: 'cenc_eqlist_api',
    label: '中国地震台网'
  }, {
    ...value,
    eventId: value.EventID || value.eventId || value.md5 || key,
    location: value.location || value.placeName || value.HypoCenter,
    magnitude: value.magnitude || value.Magnitude || value.Magunitude,
    depth: value.depth || value.Depth,
    latitude: value.latitude || value.Latitude,
    longitude: value.longitude || value.Longitude,
    intensity: value.intensity || value.MaxIntensity || value.maxIntensity,
    time: originTime
  });
  const originTimestamp = parseChinaTime(originTime || normalized.originTime);
  return {
    ...normalized,
    no: key,
    eventId: normalized.eventId || value.EventID || value.eventId || value.md5 || key,
    placeName: value.placeName || value.location || normalized.location || '-',
    depthKm: normalized.depth,
    originTime: normalized.originTime || originTime,
    originTimestamp,
    isHistory: true,
    isLive: false,
    raw: value
  };
}

function parseChinaTime(value) {
  if (!value) return 0;
  const text = String(value);
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(text)) {
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  const normalized = text.replace(' ', 'T');
  const timestamp = Date.parse(`${normalized}+08:00`);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getTimeFromNowText(originTime) {
  const timestamp = parseChinaTime(originTime);
  if (!timestamp) return '-';
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} 天前`;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(lat2 - lat1);
  const dLon = degreesToRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degreesToRadians(lat1)) *
      Math.cos(degreesToRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

function knownPlace(query) {
  const text = String(query || '').trim().toLowerCase();
  if (!text) return null;
  const places = [
    ['北京', 'beijing', 39.9042, 116.4074],
    ['成都', 'chengdu', 30.5728, 104.0668],
    ['上海', 'shanghai', 31.2304, 121.4737],
    ['广州', 'guangzhou', 23.1291, 113.2644],
    ['深圳', 'shenzhen', 22.5431, 114.0579],
    ['重庆', 'chongqing', 29.5630, 106.5516],
    ['香港', 'hong kong', 22.3193, 114.1694],
    ['澳门', 'macao', 22.1987, 113.5439],
    ['台北', 'taipei', 25.0330, 121.5654],
    ['莫斯科', 'moscow', 55.7558, 37.6173],
    ['东京', 'tokyo', 35.6762, 139.6503],
    ['首尔', 'seoul', 37.5665, 126.9780],
    ['新加坡', 'singapore', 1.3521, 103.8198]
  ];
  const item = places.find(place => text.includes(place[0].toLowerCase()) || text.includes(place[1]));
  return item ? { place: item[0], lat: item[2], lon: item[3] } : null;
}

async function resolveAdminLocation(lat, lon) {
  const area = areaFromCoordinates(lat, lon);
  const chinaArea = AREA_OPTIONS.find(item => item.key === 'CN_MAINLAND');
  if (area && area.key === 'CN_MAINLAND') {
    const amap = await reverseAmapLocation(lat, lon);
    if (amap) return amap;
  }
  if (area && area.key !== 'CN_MAINLAND') {
    const foreign = await reverseForeignLocation(lat, lon, area);
    return {
      place: foreign || standardizePlaceName(area.label),
      country: area.key,
      lat,
      lon,
      matchedLat: lat,
      matchedLon: lon,
      distanceKm: 0
    };
  }
  if (!area && chinaArea && !coordinatesInBbox(lat, lon, chinaArea.bbox)) {
    const foreign = await reverseForeignLocation(lat, lon, { label: '' });
    return {
      place: foreign || '当前位置',
      country: 'GLOBAL',
      lat,
      lon,
      matchedLat: lat,
      matchedLon: lon,
      distanceKm: 0
    };
  }
  return nearestAdminLocation(lat, lon);
}

function nearestAdminLocation(lat, lon) {
  let best = ADMIN_CENTERS[0];
  let bestDistance = Infinity;
  for (const center of ADMIN_CENTERS) {
    const distance = haversineKm(lat, lon, center.lat, center.lon);
    if (distance < bestDistance) {
      best = center;
      bestDistance = distance;
    }
  }
  return {
    place: standardizePlaceName(best.place),
    lat,
    lon,
    matchedLat: best.lat,
    matchedLon: best.lon,
    distanceKm: Number(bestDistance.toFixed(1))
  };
}

async function ipLocationFromRequest(req) {
  const external = await lookupIpLocation(clientIp(req)) || {};
  const countryCode = (headerValue(req, ['cf-ipcountry', 'x-vercel-ip-country', 'x-country-code']) || external.countryCode || '').toUpperCase();
  const region = headerValue(req, ['cf-region', 'x-vercel-ip-country-region', 'x-appengine-region', 'x-ip-region']) || external.region || '';
  const city = headerValue(req, ['cf-ipcity', 'x-vercel-ip-city', 'x-appengine-city', 'x-ip-city']) || external.city || '';
  const headerLat = Number(headerValue(req, ['cf-iplatitude', 'x-vercel-ip-latitude', 'x-geo-latitude']));
  const headerLon = Number(headerValue(req, ['cf-iplongitude', 'x-vercel-ip-longitude', 'x-geo-longitude']));
  const known = knownPlace([city, region, countryCode].filter(Boolean).join(' ')) || knownPlace(region);
  const area = areaByCountryCode(countryCode);
  const headerBase = isUsableCoordinate(headerLat, headerLon) ? { place: city || region, lat: headerLat, lon: headerLon } : null;
  const externalBase = isUsableCoordinate(external.lat, external.lon) ? { place: city || region || external.countryName, lat: external.lat, lon: external.lon } : null;
  const countryName = area ? area.label : external.countryName || (countryCode === 'RU' ? '俄罗斯' : countryCode === 'JP' ? '日本' : countryCode === 'KR' ? '韩国' : '');
  const foreignPlace = countryCode && countryCode !== 'CN'
    ? formatForeignAdminLabel(countryName, region)
    : '';
  const base = known || headerBase || externalBase;
  if (!base) {
    return {
      country_code: countryCode || '',
      country_name: countryName,
      region: standardizePlaceName(region),
      city: standardizePlaceName(city),
      place: '',
      lat: null,
      lon: null,
      source: 'ip'
    };
  }
  const admin = countryCode === 'CN' ? await resolveAdminLocation(base.lat, base.lon) : null;
  return {
    country_code: countryCode || 'CN',
    country_name: countryName,
    region: standardizePlaceName(region || base.place),
    city: standardizePlaceName(city || base.place),
    place: admin ? admin.place : foreignPlace || standardizePlaceName(base.place),
    lat: base.lat,
    lon: base.lon,
    source: 'ip'
  };
}

async function reverseAmapLocation(lat, lon) {
  if (!AMAP_JS_KEY) return null;
  const url = new URL('https://restapi.amap.com/v3/geocode/regeo');
  url.searchParams.set('key', AMAP_JS_KEY);
  url.searchParams.set('location', `${lon},${lat}`);
  url.searchParams.set('extensions', 'base');
  url.searchParams.set('radius', '1000');
  url.searchParams.set('output', 'JSON');
  if (AMAP_SECURITY_JSCODE) url.searchParams.set('jscode', AMAP_SECURITY_JSCODE);
  const data = await fetchJsonWithCache(`amap:${lat.toFixed(4)},${lon.toFixed(4)}`, url, 6 * 60 * 60 * 1000, 2500);
  if (!data || data.status !== '1' || !data.regeocode || !data.regeocode.addressComponent) return null;
  const component = data.regeocode.addressComponent;
  const province = cleanAdminPart(component.province);
  const city = cleanAdminPart(Array.isArray(component.city) ? '' : component.city);
  const district = cleanAdminPart(component.district);
  const place = [province, city && city !== province ? city : '', district].filter(Boolean).join(' ');
  if (!place) return null;
  return {
    place: standardizePlaceName(place),
    country: 'CN_MAINLAND',
    lat,
    lon,
    matchedLat: lat,
    matchedLon: lon,
    distanceKm: 0,
    source: 'amap'
  };
}

async function reverseForeignLocation(lat, lon, area) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('zoom', '5');
  url.searchParams.set('accept-language', 'zh-CN');
  const data = await fetchJsonWithCache(`reverse:${lat.toFixed(3)},${lon.toFixed(3)}`, url, 24 * 60 * 60 * 1000, 3000);
  const address = data && data.address || {};
  return formatForeignAdminLabel(
    standardizePlaceName(address.country || area.label),
    address.state || address.region || address.province || address.republic || ''
  );
}

function formatForeignAdminLabel(country, region) {
  const countryText = standardizePlaceName(country || '');
  const regionText = standardizePlaceName(region || '');
  if (!countryText) return regionText;
  if (!regionText || countryText === regionText) return countryText;
  return `${countryText} ${regionText}`;
}

function cleanAdminPart(value) {
  if (Array.isArray(value)) return '';
  return standardizePlaceName(value || '');
}

function areaFromCoordinates(lat, lon) {
  return AREA_OPTIONS.find(area => coordinatesInBbox(lat, lon, area.bbox)) || null;
}

function areaByCountryCode(code) {
  const key = String(code || '').toUpperCase();
  if (key === 'CN') return AREA_OPTIONS.find(area => area.key === 'CN_MAINLAND') || null;
  return AREA_OPTIONS.find(area => area.key === key) || null;
}

function areaCenter(area) {
  if (!area || !Array.isArray(area.bbox)) return null;
  const [minLon, minLat, maxLon, maxLat] = area.bbox;
  const centerLon = minLon <= maxLon ? (minLon + maxLon) / 2 : normalizeLongitude((minLon + maxLon + 360) / 2);
  return { place: area.label, lat: (minLat + maxLat) / 2, lon: centerLon };
}

function coordinatesInBbox(lat, lon, bbox) {
  if (!bbox || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const inLon = minLon <= maxLon ? lon >= minLon && lon <= maxLon : lon >= minLon || lon <= maxLon;
  return inLon && lat >= minLat && lat <= maxLat;
}

function normalizeLongitude(lon) {
  let value = lon;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function headerValue(req, names) {
  for (const name of names) {
    const raw = req && req.headers && req.headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) continue;
    try {
      return decodeURIComponent(String(value).replace(/\+/g, '%20')).trim();
    } catch (_error) {
      return String(value).trim();
    }
  }
  return '';
}

async function lookupIpLocation(rawIp) {
  const ip = cleanClientIp(rawIp);
  if (!isPublicIp(ip)) return null;
  const url = new URL(`https://ipwho.is/${encodeURIComponent(ip)}`);
  url.searchParams.set('lang', 'zh-CN');
  const data = await fetchJsonWithCache(`ip:${ip}`, url, 12 * 60 * 60 * 1000, 2500);
  if (!data || data.success === false) return null;
  return {
    countryCode: String(data.country_code || '').toUpperCase(),
    countryName: standardizePlaceName(data.country || ''),
    region: standardizePlaceName(data.region || ''),
    city: standardizePlaceName(data.city || ''),
    lat: isUsableCoordinate(Number(data.latitude), Number(data.longitude)) ? Number(data.latitude) : NaN,
    lon: isUsableCoordinate(Number(data.latitude), Number(data.longitude)) ? Number(data.longitude) : NaN
  };
}

async function fetchJsonWithCache(key, url, ttlMs, timeoutMs) {
  const now = Date.now();
  const cached = geoLookupCache.get(key);
  if (cached && now - cached.time < ttlMs) return cached.data;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(String(url), {
      signal: controller.signal,
      headers: { 'User-Agent': 'cnquake-dashboard/1.0 (+https://www.cnquake.xyz)' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    geoLookupCache.set(key, { time: now, data });
    if (geoLookupCache.size > 1000) {
      for (const [itemKey, item] of geoLookupCache) {
        if (now - item.time > 24 * 60 * 60 * 1000) geoLookupCache.delete(itemKey);
      }
      trimMapToSize(geoLookupCache, 1000);
    }
    return data;
  } catch (_error) {
    return cached ? cached.data : null;
  } finally {
    clearTimeout(timer);
  }
}

function cleanClientIp(value) {
  let ip = String(value || '').split(',')[0].trim().slice(0, 128);
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip.includes(']')) ip = ip.replace(/^\[|\].*$/g, '');
  if (ip.includes('%')) ip = ip.split('%')[0];
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, '');
  return ip;
}

function isPublicIp(ip) {
  const normalized = cleanClientIp(ip);
  const version = net.isIP(normalized);
  if (!version) return false;
  if (version === 4) {
    const parts = normalized.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || parts[0] >= 224) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false;
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return false;
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return false;
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return false;
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return false;
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return false;
    return true;
  }
  const lower = normalized.toLowerCase();
  return lower !== '::' &&
    lower !== '::1' &&
    !lower.startsWith('fc') &&
    !lower.startsWith('fd') &&
    !lower.startsWith('fe8') &&
    !lower.startsWith('fe9') &&
    !lower.startsWith('fea') &&
    !lower.startsWith('feb') &&
    !lower.startsWith('ff') &&
    !lower.startsWith('2001:db8:');
}

function isUsableCoordinate(lat, lon) {
  return Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lon)) &&
    Math.abs(Number(lat)) <= 90 &&
    Math.abs(Number(lon)) <= 180 &&
    !(Number(lat) === 0 && Number(lon) === 0);
}

function send(client, payload) {
  if (client.readyState !== WebSocket.OPEN) return;
  if (client.bufferedAmount > WS_MAX_BUFFERED_BYTES) {
    client.terminate();
    return;
  }
  try {
    client.send(JSON.stringify(payload));
  } catch (error) {
    console.warn('Local WebSocket send failed:', error.message);
  }
}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of localWss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    try {
      client.send(message);
    } catch (error) {
      console.warn('Local WebSocket send failed:', error.message);
    }
  }
}

function broadcastEvent(event, isUpdate) {
  for (const client of localWss.clients) {
    const filter = clientFilter(client);
    if (!matchesArea(event, filter.country, filter.region)) continue;
    const clientEvent = client.location ? { ...event, arrival: estimateWaveCountdowns(event, client.location) } : event;
    send(client, { type: 'event', event: clientEvent, isUpdate });
  }
}

function broadcastHistory() {
  for (const client of localWss.clients) {
    const filter = clientFilter(client);
    send(client, { type: 'history', events: withArrival(filteredEvents(filter), client.location) });
  }
}

function updateSourceStatus(source, patch) {
  const state = ensureSourceState(source);
  Object.assign(state, patch);
  broadcast({ type: 'source_status', source: publicState(state) });
}

function warnSourceThrottled(state, scope, message) {
  const now = Date.now();
  const signature = `${scope}:${message}`;
  if (state.lastWarningSignature === signature && now - Number(state.lastWarningAt || 0) < 60000) return;
  state.lastWarningSignature = signature;
  state.lastWarningAt = now;
  console.warn(`${scope}:`, message);
}

function scheduleReconnect(source, reason) {
  if (!sourceShouldStayActive(source)) {
    stopSource(source, '当前区域未启用');
    return;
  }
  const state = ensureSourceState(source);
  if (state.reconnectTimer) return;
  const now = Date.now();
  state.reconnectFailures = (state.reconnectFailures || []).filter(time => now - time < 60000);
  state.reconnectFailures.push(now);
  const delay = state.reconnectFailures.length > 5
    ? 120000
    : Math.min(30000, 1000 * 2 ** Math.min(state.retryCount, 5));
  state.retryCount += 1;
  updateSourceStatus(source, {
    status: 'reconnecting',
    lastError: reason || state.lastError || 'connection closed'
  });
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connectSource(source);
  }, delay);
}

function parseMessage(message) {
  let text;
  if (Buffer.isBuffer(message)) {
    text = message.toString('utf8');
  } else if (message instanceof ArrayBuffer) {
    text = Buffer.from(message).toString('utf8');
  } else if (ArrayBuffer.isView(message)) {
    text = Buffer.from(message.buffer, message.byteOffset, message.byteLength).toString('utf8');
  } else {
    text = String(message);
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { text };
  }
}

function hasEventSignal(event) {
  return Boolean(
    event.eventId ||
    (event.location && event.location !== '未知震中') ||
    event.magnitude !== null ||
    event.originTime
  );
}

function mergeWithKnownEvent(event) {
  const next = { ...event, eventKey: event.eventKey || getEventKey(event) };
  const existing = findKnownMatchingEvent(next);
  if (!existing) return next;
  const merged = mergeEarthquakeEvents(existing, next);
  replaceKnownEventCopies(merged);
  return merged;
}

function findKnownMatchingEvent(event) {
  for (const item of knownEventCandidates()) {
    if (isSameEarthquake(item, event)) return item;
  }
  return null;
}

function knownEventCandidates() {
  const events = recentEvents.slice();
  for (const state of sourceStates.values()) events.push(...(state.cachedEvents || []));
  events.push(...(chinaHistoryCache.events || []));
  return events;
}

function mergeEarthquakeEventsList(events) {
  const merged = [];
  for (const event of events || []) {
    if (!isRealEarthquake(event)) continue;
    const next = { ...event, eventKey: event.eventKey || getEventKey(event) };
    const index = merged.findIndex(item => isSameEarthquake(item, next));
    if (index >= 0) merged[index] = mergeEarthquakeEvents(merged[index], next);
    else merged.push(next);
  }
  return merged;
}

function mergeEarthquakeEvents(existing, incoming) {
  const existingKey = existing.eventKey || getEventKey(existing);
  const official = isCencOfficialEvent(incoming) ? incoming : isCencOfficialEvent(existing) ? existing : null;
  const preferred = official || incoming;
  const merged = {
    ...existing,
    ...incoming,
    eventKey: existingKey,
    isLive: Boolean(existing.isLive || incoming.isLive),
    isHistory: Boolean(existing.isHistory && incoming.isHistory),
    mergedSourceKeys: uniqueValues(existing.mergedSourceKeys, existing.source, incoming.mergedSourceKeys, incoming.source),
    mergedSourceLabels: uniqueValues(existing.mergedSourceLabels, existing.sourceLabel, incoming.mergedSourceLabels, incoming.sourceLabel),
    updatedAt: new Date().toISOString()
  };
  for (const field of OFFICIAL_FIELDS) {
    merged[field] = firstKnown(preferred && preferred[field], incoming[field], existing[field]);
  }
  merged.eventId = firstKnown(official && official.eventId, incoming.eventId, existing.eventId);
  merged.source = firstKnown(official && official.source, incoming.source, existing.source);
  merged.sourceLabel = firstKnown(official && official.sourceLabel, incoming.sourceLabel, existing.sourceLabel);
  merged.receivedAt = earliestTimeValue(existing.receivedAt, incoming.receivedAt) || merged.receivedAt;
  if (Number.isFinite(Number(official && official.originTimestamp))) merged.originTimestamp = official.originTimestamp;
  return merged;
}

function replaceKnownEventCopies(merged) {
  const replaceIn = list => {
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      if (!item || (item.eventKey !== merged.eventKey && !isSameEarthquake(item, merged))) continue;
      const flags = { isHistory: item.isHistory, isLive: item.isLive };
      list[index] = { ...mergeEarthquakeEvents(item, merged), ...flags };
    }
  };
  replaceIn(recentEvents);
  replaceIn(chinaHistoryCache.events || []);
  for (const state of sourceStates.values()) replaceIn(state.cachedEvents || []);
}

function isSameEarthquake(left, right) {
  const leftKey = left && (left.eventKey || getEventKey(left));
  const rightKey = right && (right.eventKey || getEventKey(right));
  const leftTime = eventOriginTimestamp(left);
  const rightTime = eventOriginTimestamp(right);
  if (leftKey && rightKey && leftKey === rightKey) {
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return true;
    return Math.abs(leftTime - rightTime) <= SAME_EVENT_TIME_WINDOW_MS;
  }
  const leftId = String(left && left.eventId || '').trim();
  const rightId = String(right && right.eventId || '').trim();
  if (leftId && rightId && leftId === rightId) {
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return true;
    return Math.abs(leftTime - rightTime) <= SAME_EVENT_TIME_WINDOW_MS;
  }
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return false;
  if (Math.abs(leftTime - rightTime) > SAME_EVENT_TIME_WINDOW_MS) return false;
  const distance = eventDistanceKm(left, right);
  if (distance !== null) return distance <= SAME_EVENT_DISTANCE_KM;
  const leftPlace = normalizedEventPlace(left);
  const rightPlace = normalizedEventPlace(right);
  return Boolean(leftPlace && rightPlace && (leftPlace.includes(rightPlace) || rightPlace.includes(leftPlace)));
}

function isCencOfficialEvent(event) {
  const source = String(event && event.source || '').toLowerCase();
  const label = String(event && event.sourceLabel || '');
  return CENC_OFFICIAL_SOURCE_KEYS.has(source) || label.includes('中国地震台网');
}

function eventOriginTimestamp(event) {
  const explicit = Number(event && event.originTimestamp);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const parsed = Date.parse(event && event.originTime);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function eventDistanceKm(left, right) {
  const lat1 = Number(left && left.latitude);
  const lon1 = Number(left && left.longitude);
  const lat2 = Number(right && right.latitude);
  const lon2 = Number(right && right.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  return haversineKm(lat1, lon1, lat2, lon2);
}

function normalizedEventPlace(event) {
  return String(event && (event.location || event.placeName) || '')
    .replace(/未知震中/g, '')
    .replace(/[\s,，。·\-—_]/g, '')
    .trim();
}

function firstKnown(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '' && value !== '未知震中') return value;
  }
  return values[values.length - 1];
}

function uniqueValues(...values) {
  const output = [];
  for (const value of values.flat()) {
    if (value === undefined || value === null || value === '') continue;
    if (!output.includes(value)) output.push(value);
  }
  return output;
}

function earliestTimeValue(...values) {
  return values
    .filter(Boolean)
    .map(value => ({ value, time: Date.parse(value) }))
    .filter(item => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time)[0]?.value || values.filter(Boolean)[0] || '';
}

function rememberEvent(event, options = {}) {
  const baseEvent = { ...event, eventKey: event.eventKey || getEventKey(event) };
  const knownEvent = findKnownMatchingEvent(baseEvent);
  const nextEvent = knownEvent ? mergeEarthquakeEvents(knownEvent, baseEvent) : baseEvent;
  const pushPhase = pushPhaseForIncoming(baseEvent, knownEvent);
  if (knownEvent) replaceKnownEventCopies(nextEvent);
  const shouldStore = isDemoEvent(nextEvent);
  if (!shouldStore) {
    if (options.broadcast !== false && !nextEvent.isHistory) {
      broadcastEvent(nextEvent, Boolean(knownEvent));
      pushEarthquakeNotification(nextEvent, pushPhase);
    }
    return false;
  }
  const existingIndex = recentEvents.findIndex(item => item.eventKey === nextEvent.eventKey || isSameEarthquake(item, nextEvent));
  if (existingIndex >= 0) {
    recentEvents[existingIndex] = mergeEarthquakeEvents(recentEvents[existingIndex], nextEvent);
    if (options.broadcast !== false) {
      broadcastEvent(recentEvents[existingIndex], true);
      if (!recentEvents[existingIndex].isHistory) pushEarthquakeNotification(recentEvents[existingIndex], pushPhase);
    }
    return true;
  }

  recentEvents.unshift(nextEvent);
  recentEvents.sort((a, b) => eventTime(b) - eventTime(a));
  if (recentEvents.length > MAX_DEMO_EVENTS) recentEvents.length = MAX_DEMO_EVENTS;
  if (options.broadcast !== false) {
    broadcastEvent(nextEvent, false);
    if (!nextEvent.isHistory) pushEarthquakeNotification(nextEvent, pushPhase);
  }
  return true;
}

function pushPhaseForIncoming(incoming, knownEvent) {
  if (knownEvent && isCencOfficialEvent(incoming) && !isCencOfficialEvent(knownEvent)) return 'official';
  return 'initial';
}

function cacheSourceEvent(source, event) {
  if (!source || !event || !isRealEarthquake(event)) return null;
  const merged = mergeWithKnownEvent(event);
  mergeSourceCache(source, [{
    ...merged,
    source: merged.source || source.key,
    sourceLabel: merged.sourceLabel || source.label,
    isHistory: true,
    isLive: false,
    receivedAt: merged.receivedAt || new Date().toISOString()
  }]);
  return merged;
}

function isDemoEvent(event) {
  return Number(event && event.magnitude) >= DEMO_MIN_MAGNITUDE && matchesArea(event, DEMO_FILTER.country, DEMO_FILTER.region);
}

function handleUpstreamMessage(source, message) {
  const state = ensureSourceState(source);
  const lastMessageAt = new Date().toISOString();
  state.lastMessageAt = lastMessageAt;
  updateSourceStatus(source, { status: state.status === 'connected' ? 'connected' : state.status, lastMessageAt });
  const rawData = parseMessage(message);
  const event = { ...normalizeEarthquakeData(source, rawData), isLive: true, isHistory: false };
  if (!hasEventSignal(event) || !isRealEarthquake(event)) return;
  const mergedEvent = cacheSourceEvent(source, event) || event;
  if (!eventWantedByAnyClient(mergedEvent)) return;
  rememberEvent(mergedEvent);
}

function eventTime(event) {
  const parsed = Date.parse(event && (event.originTime || event.receivedAt));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function extractHistoryRecords(rawData) {
  if (rawData && rawData.type === 'FeatureCollection' && Array.isArray(rawData.features)) return rawData.features;
  if (Array.isArray(rawData)) return rawData;
  if (!rawData || typeof rawData !== 'object') return [];
  if (rawData.records && Array.isArray(rawData.records.Earthquake)) return rawData.records.Earthquake;
  if (rawData.records && Array.isArray(rawData.records.earthquake)) return rawData.records.earthquake;
  const keys = ['data', 'Data', 'list', 'List', 'records', 'rows', 'shuju', 'result', 'features'];
  for (const key of keys) {
    if (Array.isArray(rawData[key])) return rawData[key];
  }
  return [];
}

function parseHistoryText(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch) return [];
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (_nestedError) {
      return [];
    }
  }
}

async function fetchHistoryFrom(source) {
  const response = await fetch(source.url, {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      Referer: 'https://news.ceic.ac.cn/',
      'User-Agent': 'Mozilla/5.0'
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  return extractHistoryRecords(parseHistoryText(text));
}

async function loadHistoricalEventsForFilter(filter = DEFAULT_FILTER, limit = 10) {
  for (const source of HISTORY_SOURCES) {
    try {
      const records = await fetchHistoryFrom(source);
      const now = Date.now();
      const events = records
        .map(record => ({
          ...normalizeEarthquakeData(source, record),
          isHistory: true,
          isLive: false,
          receivedAt: new Date().toISOString()
        }))
        .filter(event => isRealEarthquake(event) && eventTime(event) <= now && matchesArea(event, filter.country, filter.region))
        .sort((a, b) => eventTime(b) - eventTime(a))
        .slice(0, limit);

      if (events.length) {
        console.log(`已加载历史地震 ${events.length} 条: ${source.url}`);
        return events;
      }
    } catch (error) {
      console.warn(`历史地震拉取失败 ${source.url}:`, error.message);
    }
  }
  return [];
}

function connectSource(source) {
  if (!sourceShouldStayActive(source)) {
    stopSource(source, '当前区域未启用');
    return;
  }
  const state = ensureSourceState(source);
  if (state.ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.ws.readyState)) return;

  state.enabled = true;
  updateSourceStatus(source, { status: 'connecting', lastError: '' });
  const upstream = new WebSocket(source.url, {
    handshakeTimeout: 15000,
    maxPayload: WS_MAX_UPSTREAM_PAYLOAD,
    perMessageDeflate: false
  });
  state.ws = upstream;

  upstream.on('open', () => {
    if (state.ws !== upstream || !state.enabled || !sourceShouldStayActive(source)) return;
    state.everConnected = true;
    state.reconnectFailures = [];
    updateSourceStatus(source, {
      status: 'connected',
      retryCount: 0,
      connectedAt: new Date().toISOString(),
      lastError: ''
    });
  });

  upstream.on('message', message => {
    if (state.ws !== upstream || !state.enabled || !sourceShouldStayActive(source)) return;
    try {
      handleUpstreamMessage(source, message);
    } catch (error) {
      updateSourceStatus(source, { status: 'error', lastError: error.message });
      warnSourceThrottled(state, `Failed to handle ${source.key} message`, error.message);
    }
  });

  upstream.on('error', error => {
    if (state.ws !== upstream || !state.enabled || !sourceShouldStayActive(source)) return;
    updateSourceStatus(source, { status: 'error', lastError: error.message });
    warnSourceThrottled(state, `Upstream ${source.key} error`, error.message);
  });

  upstream.on('close', (code, buffer) => {
    if (state.ws !== upstream || !state.enabled || !sourceShouldStayActive(source)) return;
    state.ws = null;
    const reason = buffer && buffer.length ? buffer.toString('utf8') : `closed ${code}`;
    scheduleReconnect(source, reason);
  });
}

async function pollSource(source, options = {}) {
  const wanted = sourceWanted(source);
  if (!wanted && !options.cacheOnly) return;
  const requestUrl = sourceRequestUrl(source);
  if (!requestUrl) {
    const state = ensureSourceState(source);
    if (sourceShouldStayActive(source)) {
      state.enabled = true;
      updateSourceStatus(source, { status: 'reconnecting', lastError: '等待接口配置' });
    } else {
      stopSource(source, '未配置接口');
    }
    return;
  }
  const state = ensureSourceState(source);
  updateSourceStatus(source, { status: 'connecting', lastError: '' });
  try {
    const response = await fetch(requestUrl, {
      headers: { Accept: 'application/json,text/plain,*/*', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.text();
    const parsed = parseHistoryText(raw);
    const records = extractHistoryRecords(parsed).slice(0, 50);
    const firstPoll = !state.hasPolled;
    const now = Date.now();
    let accepted = 0;
    const cacheEvents = [];

    for (const record of records) {
      const sourceRecord = source.key === 'cwa_taiwan' ? simplifyTaiwanPayload(record) : record;
      const base = normalizeEarthquakeData(source, sourceRecord);
      if (!isRealEarthquake(base)) continue;
      cacheEvents.push({
        ...base,
        isHistory: true,
        isLive: false,
        receivedAt: new Date().toISOString()
      });
      if (options.cacheOnly || !eventWantedByAnyClient(base)) continue;
      const ageMs = now - eventTime(base);
      const isFresh = !firstPoll && ageMs >= 0 && ageMs <= 10 * 60 * 1000;
      if (!isFresh) continue;
      if (rememberEvent({
        ...base,
        isLive: true,
        isHistory: false,
        receivedAt: new Date().toISOString()
      })) accepted += 1;
    }

    mergeSourceCache(source, cacheEvents);
    state.hasPolled = true;
    updateSourceStatus(source, {
      status: 'connected',
      retryCount: 0,
      lastError: '',
      lastMessageAt: new Date().toISOString(),
      connectedAt: state.connectedAt || new Date().toISOString()
    });
    if (accepted) broadcastHistory();
  } catch (error) {
    const message = readablePollError(source, error);
    updateSourceStatus(source, { status: 'error', lastError: message });
    warnSourceThrottled(state, `备用源 ${source.key} 拉取失败`, message);
  }
}

function startPollingSource(source) {
  if (!sourceRequestUrl(source)) {
    const state = ensureSourceState(source);
    if (sourceShouldStayActive(source)) {
      state.enabled = true;
      updateSourceStatus(source, { status: 'reconnecting', lastError: '等待接口配置' });
      if (!state.pollTimer) state.pollTimer = setInterval(() => pollSource(source), source.intervalMs || 60000);
    } else {
      stopSource(source, '未配置接口');
    }
    return;
  }
  const state = ensureSourceState(source);
  pollSource(source);
  if (!state.pollTimer) state.pollTimer = setInterval(() => pollSource(source), source.intervalMs || 60000);
}

function startSourceCacheRefresh() {
  const pollSources = ALL_SOURCES.filter(source => source.type === 'poll');
  pollSources.forEach(source => {
    if (sourceRequestUrl(source) && sourceWanted(source)) pollSource(source, { cacheOnly: true });
  });
  const timer = setInterval(() => {
    pollSources.forEach(source => {
      if (sourceRequestUrl(source) && sourceWanted(source)) pollSource(source, { cacheOnly: true });
    });
  }, SOURCE_CACHE_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

function sourceRequestUrl(source) {
  if (!source) return '';
  if (source.key === 'cwa_taiwan') {
    return cwaRequestUrl(source);
  }
  if (source.key === 'ras_russia') {
    return process.env.RUSSIA_EARTHQUAKE_URL || process.env.RAS_EARTHQUAKE_URL || source.url || '';
  }
  return source.url || '';
}

function cwaRequestUrl(source) {
  const token = process.env.CWA_API_KEY || process.env.CWA_AUTHORIZATION || process.env.TAIWAN_CWA_TOKEN || '';
  if (!token) return '';
  const explicitUrl = process.env.CWA_EARTHQUAKE_URL || process.env.TAIWAN_CWA_URL || '';
  const baseUrl = process.env.CWA_API_BASE_URL || process.env.CWA_PROXY_BASE_URL || '';
  const endpoint = explicitUrl || (baseUrl ? `${baseUrl.replace(/\/+$/, '')}${CWA_DATASET_PATH}` : source.url);
  const url = new URL(endpoint);
  url.searchParams.set('Authorization', token);
  url.searchParams.set('format', 'JSON');
  return url.toString();
}

function readablePollError(source, error) {
  const message = error && error.message ? String(error.message) : '拉取失败';
  if (!source || source.key !== 'cwa_taiwan') return message;
  if (/HTTP\s+(401|403)/i.test(message)) return '台湾 CWA 授权码无效或无权限';
  if (/HTTP\s+429/i.test(message)) return '台湾 CWA 请求过于频繁';
  if (/fetch failed|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|AbortError|timeout|network/i.test(message)) {
    return '台湾 CWA 网络不可达，请配置 CWA_API_BASE_URL 指向可访问代理';
  }
  if (/HTTP\s+\d+/i.test(message)) return `台湾 CWA 官方接口返回 ${message}`;
  return '台湾 CWA 拉取失败';
}

function scheduleCencListMonitor() {
  if (cencListMonitorTimer) return;
  const delay = 1000 + Math.floor(Math.random() * 900);
  cencListMonitorTimer = setTimeout(async () => {
    cencListMonitorTimer = null;
    await checkCencListForNewEvents();
    scheduleCencListMonitor();
  }, delay);
}

async function checkCencListForNewEvents() {
  try {
    const raw = await fetchCencEqlist();
    const events = normalizeCencList(raw)
      .filter(event => isRealEarthquake(event))
      .sort((a, b) => b.originTimestamp - a.originTimestamp)
      .slice(0, 30);

    if (!cencListMonitorPrimed) {
      events.forEach(event => cencListSeenKeys.add(event.eventKey || getEventKey(event)));
      cencListMonitorPrimed = true;
      return;
    }

    for (const event of events.reverse()) {
      const key = event.eventKey || getEventKey(event);
      if (cencListSeenKeys.has(key)) continue;
      cencListSeenKeys.add(key);
      const liveEvent = {
        ...event,
        eventKey: key,
        isHistory: false,
        isLive: true,
        receivedAt: new Date().toISOString()
      };
      rememberEvent(liveEvent);
    }
    while (cencListSeenKeys.size > 300) {
      cencListSeenKeys.delete(cencListSeenKeys.values().next().value);
    }
  } catch (error) {
    console.warn('CENC 列表监控失败:', error.message);
  }
}

localWss.on('connection', (client, req) => {
  const ip = clientIp(req);
  if (openWsCount(ip) >= WS_MAX_CONNECTIONS_PER_IP) {
    client.close(1008, '连接过多');
    return;
  }
  client.ip = ip;
  client.isAlive = true;
  client.messageWindowStart = Date.now();
  client.messageCount = 0;
  client.filter = { ...DEFAULT_FILTER };
  send(client, {
    type: 'hello',
    sources: allSourceStates(),
    events: filteredEvents(client.filter)
  });
  client.on('message', message => {
    if (!allowClientMessage(client)) {
      client.close(1008, '消息过于频繁');
      return;
    }
    const payload = parseMessage(message);
    if (payload.type !== 'area_filter') return;
    client.filter = {
      country: safeText(payload.country || DEFAULT_FILTER.country, 32),
      region: safeText(payload.region || DEFAULT_FILTER.region, 48)
    };
    client.location = readUserLocation(payload.userLocation) || client.location || null;
    send(client, { type: 'history', events: withArrival(filteredEvents(client.filter), client.location) });
    reconcileSources();
  });
  client.on('pong', () => {
    client.isAlive = true;
  });
  client.on('error', () => {});
  client.on('close', reconcileSources);
  reconcileSources();
});

function startWebSocketHeartbeat() {
  const timer = setInterval(() => {
    for (const client of localWss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      try {
        client.ping();
      } catch (_error) {
        client.terminate();
      }
    }
  }, 30000);
  if (timer.unref) timer.unref();
}

function openWsCount(ip) {
  let count = 0;
  for (const client of localWss.clients) {
    if (client.readyState === WebSocket.OPEN && client.ip === ip) count += 1;
  }
  return count;
}

function allowClientMessage(client) {
  const now = Date.now();
  if (now - Number(client.messageWindowStart || 0) > 60000) {
    client.messageWindowStart = now;
    client.messageCount = 0;
  }
  client.messageCount = Number(client.messageCount || 0) + 1;
  return client.messageCount <= WS_MAX_MESSAGES_PER_MINUTE;
}

function eventWantedByAnyClient(event) {
  for (const client of localWss.clients) {
    const filter = clientFilter(client);
    if (matchesArea(event, filter.country, filter.region)) return true;
  }
  for (const record of pushSubscriptions.values()) {
    if (pushMatchesArea(event, record.area)) return true;
  }
  return false;
}

function sourceWanted(source) {
  for (const client of localWss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (sourceSupportsFilter(source, clientFilter(client))) return true;
  }
  for (const record of pushSubscriptions.values()) {
    if (sourceSupportsFilter(source, record.area || DEFAULT_FILTER)) return true;
  }
  return false;
}

function sourceShouldStayActive(source) {
  if (sourceWanted(source)) return true;
  return MAINLAND_SOURCE_KEYS.has(source.key);
}

function sourceSupportsFilter(source, filter) {
  const country = filter.country || DEFAULT_FILTER.country;
  const region = filter.region || DEFAULT_FILTER.region;
  if (country === 'GLOBAL') return true;
  if (source.key === 'cwa_taiwan') return country === 'CN_MAINLAND' && ['all', 'taiwan'].includes(region);
  if (source.key === 'ras_russia') return country === 'RU';
  if (source.type === 'poll') return country === 'GLOBAL' || country !== 'CN_MAINLAND';
  if (['cenc_eew', 'cenc_eqlist', 'cenc_intensity'].includes(source.key)) {
    return country === 'CN_MAINLAND';
  }
  if (source.key === 'sc_eew') return country === 'CN_MAINLAND' && ['all', 'sichuan'].includes(region);
  if (source.key === 'fj_eew') return country === 'CN_MAINLAND' && ['all', 'fujian'].includes(region);
  if (source.key === 'cq_eew') return country === 'CN_MAINLAND' && ['all', 'chongqing'].includes(region);
  return true;
}

function reconcileSources() {
  for (const source of ALL_SOURCES) {
    const state = ensureSourceState(source);
    if (sourceShouldStayActive(source)) {
      state.enabled = true;
      if (source.type === 'poll') startPollingSource(source);
      else connectSource(source);
    } else {
      stopSource(source, '当前区域未启用');
    }
  }
}

function stopSource(source, reason) {
  const state = ensureSourceState(source);
  state.enabled = false;
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  if (state.ws) {
    const ws = state.ws;
    state.ws = null;
    try {
      ws.close(1000, 'area disabled');
    } catch (_error) {
      ws.terminate();
    }
  }
  updateSourceStatus(source, {
    status: 'closed',
    lastError: reason || '',
    retryCount: 0
  });
}

function start() {
  loadChinaHistoryCache();
  loadDebugPassword();
  loadYandexQuota();
  initPushSupport();
  triggerChinaHistoryRefresh(!chinaHistoryCache.events.length);
  const cacheTimer = setInterval(() => triggerChinaHistoryRefresh(false), HISTORY_CACHE_INTERVAL_MS);
  if (cacheTimer.unref) cacheTimer.unref();
  scheduleCencListMonitor();
  startSourceCacheRefresh();
  server.listen(PORT, HOST, () => {
    for (const source of ALL_SOURCES) ensureSourceState(source);
    reconcileSources();
    const protocol = server.isHttps ? 'https' : 'http';
    console.log(`中国地震数据监控已启动: ${protocol}://${HOST}:${PORT}`);
    console.log(`出站 DNS 地址顺序: ${DNS_RESULT_ORDER}`);
    console.log(OBS_ENABLED ? `OBS 浏览器源: ${protocol}://${HOST}:${PORT}/obs` : 'OBS 浏览器源已由服务器配置关闭');
    const pushTransport = publicPushTransport();
    if (pushTransport.mode === 'relay') {
      console.log(`后台推送传输: Cloudflare 中继 ${pushTransport.relayHost}${pushTransport.relayPath}`);
      refreshPushRelayProbe(true).then(result => {
        console.log(result && result.ok
          ? `后台推送中继自检通过: ${result.host}，签名配置一致`
          : `后台推送中继自检失败: ${result && result.host || pushTransport.relayHost} ${result && result.code || ''}`);
      }).catch(() => {});
      startPushRelayRecoveryMonitor();
    } else {
      console.log(`后台推送传输: ${pushTransport.mode}`);
    }
  });
}

function createServer(app) {
  const keyPath = process.env.TLS_KEY_PATH;
  const certPath = process.env.TLS_CERT_PATH;
  if (keyPath && certPath) {
    const secureServer = https.createServer({
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      maxHeaderSize: HTTP_MAX_HEADER_SIZE
    }, app);
    secureServer.isHttps = true;
    return configureHttpServer(secureServer);
  }
  const plainServer = http.createServer({ maxHeaderSize: HTTP_MAX_HEADER_SIZE }, app);
  plainServer.isHttps = false;
  return configureHttpServer(plainServer);
}

function configureHttpServer(httpServer) {
  httpServer.headersTimeout = 10000;
  httpServer.requestTimeout = 15000;
  httpServer.keepAliveTimeout = 5000;
  httpServer.maxRequestsPerSocket = 100;
  httpServer.maxConnections = SERVER_MAX_CONNECTIONS;
  return httpServer;
}

function handleServerError(error) {
  if (serverErrorHandled) return;
  serverErrorHandled = true;
  const message = error && error.code === 'EADDRINUSE'
    ? `端口 ${PORT} 已被占用，请关闭正在运行的服务或使用 PORT 指定其他端口。`
    : '服务启动或网络监听异常，请检查运行环境。';
  console.error(message);
  process.exitCode = 1;
  if (error && error.code === 'EADDRINUSE') setImmediate(() => process.exit(1));
}

function handleClientError(error, socket) {
  if (!socket || socket.destroyed) return;
  if (error && error.code === 'HPE_HEADER_OVERFLOW') {
    const body = [
      '<!doctype html><meta charset="utf-8">',
      '<title>请求头过大</title>',
      '<style>body{margin:0;display:grid;min-height:100vh;place-items:center;background:#101820;color:#f8fafc;font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:620px;padding:28px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08)}h1{margin:0 0 12px;font-size:28px}p{margin:0 0 10px;color:#d6dee8}</style>',
      '<main><h1>请求头过大，正在清理本地 Cookie</h1>',
      '<p>浏览器为本站保存的旧 Cookie 过多，服务端已发送清理指令。</p>',
      '<p>请刷新页面一次；如果仍然出现 431，请在浏览器站点设置里清除本网站 Cookie 后再打开。</p></main>'
    ].join('');
    const headers = [
      'HTTP/1.1 431 Request Header Fields Too Large',
      'Content-Type: text/html; charset=utf-8',
      'Cache-Control: no-store',
      'Connection: close',
      'Clear-Site-Data: "cookies"',
      ...cookieResetHeadersFromRawPacket(error.rawPacket),
      `Content-Length: ${Buffer.byteLength(body)}`
    ];
    socket.end(`${headers.join('\r\n')}\r\n\r\n${body}`);
    return;
  }
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
}

function cookieResetHeadersFromRawPacket(rawPacket) {
  const names = new Set(CLIENT_COOKIE_RESET_NAMES);
  for (const name of cookieNamesFromRawPacket(rawPacket)) {
    if (name.startsWith(CLIENT_COOKIE_PREFIX)) names.add(name);
    if (names.size >= 80) break;
  }
  return Array.from(names)
    .map(safeCookieName)
    .filter(Boolean)
    .map(name => `Set-Cookie: ${name}=; Max-Age=0; Path=/; SameSite=Lax`);
}

function cookieNamesFromRawPacket(rawPacket) {
  let text = '';
  try {
    text = rawPacket ? rawPacket.toString('latin1') : '';
  } catch (_error) {
    return [];
  }
  const match = text.match(/(?:^|\r\n)Cookie:\s*([^\r\n]*)/i);
  if (!match) return [];
  return match[1]
    .split(';')
    .map(part => part.slice(0, part.indexOf('=') < 0 ? part.length : part.indexOf('=')).trim())
    .filter(Boolean);
}

function safeCookieName(name) {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) ? name : '';
}

function isMobileRequest(req) {
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  return /android|iphone|ipod|ipad|mobile|harmonyos|openharmony/.test(ua);
}

function parseTrustProxySetting(value) {
  const text = String(value === undefined ? '' : value).trim();
  if (!text) return 'loopback, linklocal, uniquelocal';
  if (text === '0' || text.toLowerCase() === 'false' || text.toLowerCase() === 'off') return false;
  if (/^\d+$/.test(text)) return Math.max(0, Math.min(10, Number(text)));
  return text;
}

function requestIsSecure(req) {
  return Boolean(req && req.secure);
}

function requireHttpsRequest(req, res, next) {
  if (requestIsSecure(req)) {
    next();
    return;
  }
  res.status(426).set('Upgrade', 'TLS/1.2').json({
    ok: false,
    supported: false,
    message: '后台推送接口仅允许通过 HTTPS 访问'
  });
}

function requireHttpsOrLoopbackRequest(req, res, next) {
  if (requestIsSecure(req) || isLoopbackRequest(req)) {
    next();
    return;
  }
  requireHttpsRequest(req, res, next);
}

function isLoopbackRequest(req) {
  const remote = cleanClientIp(req && req.socket && req.socket.remoteAddress);
  if (remote !== '127.0.0.1' && remote !== '::1') return false;
  const host = String(req && req.headers && req.headers.host || '').trim();
  try {
    const hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch (_error) {
    return false;
  }
}

function securityHeaders(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('base64url');
  res.locals.cspNonce = nonce;
  res.setHeader('X-Earthquake-Release', ASSET_VERSION);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', contentSecurityPolicy(nonce));
  res.setHeader('Origin-Agent-Cluster', '?1');
  if (requestIsSecure(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
}

function contentSecurityPolicy(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' 'wasm-unsafe-eval' https://*.amap.com https://*.tianditu.gov.cn https://*.googleapis.com https://*.gstatic.com https://*.yandex.ru https://*.yandex.net https://yastatic.net https://*.yastatic.net https://js.arcgis.com`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://js.arcgis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' ws: wss: https:",
    "frame-src https://www.google.com https://maps.google.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'"
  ].join('; ');
}

function redirectPublicHttpToHttps(req, res, next) {
  if (requestIsSecure(req)) {
    next();
    return;
  }
  try {
    const origin = new URL(PUBLIC_ORIGIN);
    const requestHost = String(req && req.headers && req.headers.host || '').toLowerCase();
    if (origin.protocol !== 'https:' || requestHost !== origin.host.toLowerCase()) {
      next();
      return;
    }
    const requestPath = String(req.originalUrl || '/').replace(/[\r\n]/g, '');
    res.redirect(308, origin.origin + (requestPath.startsWith('/') ? requestPath : '/'));
  } catch (_error) {
    next();
  }
}

function enforceRequestBoundary(req, res, next) {
  const allowedMethods = ['GET', 'HEAD', 'POST', 'OPTIONS'];
  if (!allowedMethods.includes(req.method)) {
    res.setHeader('Allow', allowedMethods.join(', '));
    res.status(405).json({ error: '请求方法不受支持' });
    return;
  }
  if (String(req.originalUrl || '').length > 8192) {
    res.status(414).json({ error: '请求地址过长' });
    return;
  }
  next();
}

function rejectCrossOriginMutation(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    next();
    return;
  }
  const origin = String(req.headers.origin || '').trim();
  const fetchSite = String(req.headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (!origin && fetchSite !== 'cross-site') {
    next();
    return;
  }
  if (origin && requestOriginAllowed(req, origin)) {
    next();
    return;
  }
  res.status(403).json({ error: '拒绝跨站请求' });
}

function requestOriginAllowed(req, origin) {
  try {
    const originUrl = new URL(origin);
    if (!['http:', 'https:'].includes(originUrl.protocol)) return false;
    const requestHost = String(req && req.headers && req.headers.host || '').toLowerCase();
    const requestProtocol = requestIsSecure(req) ? 'https:' : 'http:';
    if (requestHost && originUrl.host.toLowerCase() === requestHost && originUrl.protocol === requestProtocol) return true;
    try {
      return originUrl.origin === new URL(PUBLIC_ORIGIN).origin;
    } catch (_error) {
      return false;
    }
  } catch (_error) {
    return false;
  }
}

function verifyWebSocketClient(info) {
  if (localWss.clients.size >= WS_MAX_CONNECTIONS) return false;
  const origin = String(info.origin || info.req && info.req.headers && info.req.headers.origin || '').trim();
  return !origin || requestOriginAllowed(info.req, origin);
}

function clientIp(req) {
  if (!req) return 'unknown';
  const expressIp = cleanClientIp(req.ip);
  if (net.isIP(expressIp)) return expressIp;
  const remote = cleanClientIp(req.socket && req.socket.remoteAddress);
  const forwarded = String(req.headers && req.headers['x-forwarded-for'] || '')
    .split(',')
    .map(cleanClientIp)
    .filter(ip => net.isIP(ip));
  const trustsLocalProxy = TRUST_PROXY !== false && net.isIP(remote) && !isPublicIp(remote);
  if (trustsLocalProxy && forwarded.length) return forwarded[forwarded.length - 1];
  return net.isIP(remote) ? remote : 'unknown';
}

function requestLimitRule(req) {
  const pathName = String(req.path || req.url || '');
  if (pathName.startsWith('/debug/')) return { key: 'debug', limit: 8, banMs: 30 * 60 * 1000 };
  if (pathName.startsWith('/push/')) return { key: 'push', limit: 30, banMs: 15 * 60 * 1000 };
  if (pathName === '/map/yandex-access') return { key: 'yandex', limit: 10, banMs: 30 * 60 * 1000 };
  if (pathName.startsWith(AMAP_SERVICE_PREFIX)) return { key: 'map', limit: 240, banMs: 10 * 60 * 1000 };
  if (pathName === '/history' || pathName === '/api/nearby-earthquakes') return { key: 'history', limit: 30, banMs: 10 * 60 * 1000 };
  if (pathName === '/reverse-location' || pathName === '/ip-location') return { key: 'location', limit: 30, banMs: 10 * 60 * 1000 };
  if (pathName === '/sources' || pathName === '/arrival' || pathName === '/geocode' || pathName === '/ip-location' || pathName === '/reverse-location' || pathName === '/config') {
    return { key: 'api', limit: 60, banMs: 10 * 60 * 1000 };
  }
  return { key: 'page', limit: 300, banMs: 10 * 60 * 1000 };
}

function rateLimitBan(req, res, next) {
  const now = Date.now();
  const key = clientIp(req);
  const rule = requestLimitRule(req);
  const bucket = requestBuckets.get(key) || { count: 0, windowStart: now, bannedUntil: 0, paths: {} };
  if (bucket.bannedUntil > now) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.bannedUntil - now) / 1000))));
    res.setHeader('Cache-Control', 'no-store');
    res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    return;
  }
  if (now - bucket.windowStart > 60000) {
    bucket.count = 0;
    bucket.paths = {};
    bucket.windowStart = now;
  }
  bucket.count += 1;
  bucket.paths[rule.key] = Number(bucket.paths[rule.key] || 0) + 1;
  if (bucket.count > 300 || bucket.paths[rule.key] > rule.limit) {
    bucket.bannedUntil = now + rule.banMs;
    bucket.count = 0;
    bucket.paths = {};
    console.warn(`请求频率过高，已临时封禁 ${key}`);
    res.setHeader('Retry-After', String(Math.ceil(rule.banMs / 1000)));
    res.setHeader('Cache-Control', 'no-store');
    res.status(429).json({ error: '请求过于频繁，已临时限制访问' });
    requestBuckets.set(key, bucket);
    return;
  }
  requestBuckets.delete(key);
  requestBuckets.set(key, bucket);
  if (requestBuckets.size > MAX_RATE_LIMIT_BUCKETS) {
    for (const [itemKey, item] of requestBuckets) {
      if (item.bannedUntil <= now && now - item.windowStart > 10 * 60 * 1000) requestBuckets.delete(itemKey);
    }
    trimMapToSize(requestBuckets, MAX_RATE_LIMIT_BUCKETS);
  }
  next();
}

function trimMapToSize(map, maxSize) {
  while (map.size > maxSize) map.delete(map.keys().next().value);
}

function handleRequestError(error, _req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error && error.type === 'entity.too.large') {
    res.status(413).json({ error: '请求内容过大' });
    return;
  }
  if (error && (error.type === 'entity.parse.failed' || error instanceof SyntaxError)) {
    res.status(400).json({ error: 'JSON 请求格式无效' });
    return;
  }
  console.error('请求处理失败:', error && error.message || error);
  res.status(500).json({ error: '服务器暂时无法处理请求' });
}

try {
  start();
} catch (error) {
  console.error('服务启动失败:', error);
  process.exitCode = 1;
}
