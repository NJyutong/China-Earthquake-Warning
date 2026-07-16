(function () {
  const {
    ALL_SOURCES,
    MAP_SOURCES,
    AREA_OPTIONS,
    standardizePlaceName,
    getEventKey,
    isRealEarthquake,
    matchesArea,
    estimateWaveCountdowns,
    estimateEpicenterIntensity,
    estimateLocalIntensity,
    intensityColor,
    formatIntensitySummary,
    magnitudeIntensity,
    formatNumber,
    formatCoordinatePair,
    formatCountdown,
    wavePixelSize,
    formatTime,
    formatTimeWithZone,
    taiwanLocationLayout,
    liveChannelStatus,
  } = window.EarthquakeShared;

  const state = {
    events: [],
    areaEvents: [],
    sources: new Map(),
    hasSourceSnapshot: false,
    sourceSnapshotAt: 0,
    ws: null,
    reconnectDelay: 1000,
    wsHelloTimer: null,
    serverConnectionState: 'connecting',
    lastSourceFallbackAt: 0,
    map: null,
    marker: null,
    circle: null,
    userMarker: null,
    mapToken: '',
    mapConfig: {},
    mapSourceKey: readMapSource(),
    activeMapSource: '',
    lastUsableMapSource: '',
    mapHasLoaded: false,
    mapLoadId: 0,
    mapFocusTarget: 'epicenter',
    mapFocusRequestId: 0,
    userContextPromise: null,
    browserLocationPromise: null,
    autoLocationRequested: false,
    geoCountryCode: '',
    geoRegionName: '',
    hasStoredCountry: false,
    theme: readTheme(),
    themeMode: readThemeMode(),
    countryKey: 'CN_MAINLAND',
    regionKey: 'all',
    notificationThreshold: readNotificationThreshold(),
    desktopNotificationsEnabled: false,
    webPushEnabled: false,
    notificationArea: { country: 'CN_MAINLAND', region: 'all', province: 'all', city: 'all', district: 'all' },
    selectedEventKey: '',
    historyError: '',
    dataStatus: 'connecting',
    pendingMapNotice: '',
    userLocation: readUserLocation()
  };

  const legacyChinaRegions = { HK: 'hongkong', MO: 'macao', TW: 'taiwan' };
  const chinaAdmin = Array.isArray(window.CHINA_ADMIN) ? window.CHINA_ADMIN : [];
  const ID_ALIASES = {
    'current-time': 'clock',
    'source-status-list': 'source-popover-list',
    'client-status': 'desktop-client-status',
    'map-stage': 'desktop-map-stage',
    'map-source-status': 'desktop-map-caption',
    'map-hint': 'desktop-map-status',
    'map-token-row': 'desktop-map-token-row',
    'map-token': 'desktop-map-token',
    'save-map-token': 'desktop-save-map-token',
    'event-list': 'desktop-event-list',
    'latest-source': 'desktop-alert-label',
    'latest-location': 'desktop-alert-title',
    'latest-magnitude': 'summary-mag',
    'latest-coords': 'desktop-map-coords',
    'latest-origin': 'desktop-detail-origin',
    'latest-received': 'desktop-detail-received',
    'latest-source-detail': 'desktop-detail-source',
    'latest-event-id': 'desktop-detail-id',
    'settings-open': 'desktop-settings-open',
    'settings-close': 'desktop-settings-close',
    'settings-backdrop': 'desktop-settings-backdrop',
    'control-panel': 'desktop-settings-drawer',
    'notification-toggle': 'desktop-notification-toggle',
    'notification-status': 'desktop-notification-status',
    'notification-settings-panel': 'desktop-notification-settings-panel',
    'voice-toggle': 'desktop-voice-toggle',
    'voice-status': 'desktop-voice-status',
    'intensity-threshold': 'desktop-intensity-threshold',
    'country-select': 'desktop-country-select',
    'region-select': 'desktop-region-select',
    'notify-country': 'desktop-notify-country',
    'notify-region': 'desktop-notify-region',
    'notify-province': 'desktop-notify-province',
    'notify-city': 'desktop-notify-city',
    'notify-district': 'desktop-notify-district',
    'debug-enable': 'desktop-debug-enable',
    'debug-status': 'desktop-control-status',
    'debug-floating-panel': 'desktop-debug-floating-panel',
    'debug-panel-handle': 'desktop-debug-panel-handle',
    'debug-float-add-history': 'desktop-debug-float-add-history',
    'debug-float-cookie-bar': 'desktop-debug-float-cookie',
    'debug-float-test-notification': 'desktop-debug-float-test-notification',
    'debug-float-test-push': 'desktop-debug-float-test-push',
    'debug-float-exit': 'desktop-debug-float-exit',
    'debug-float-status': 'desktop-debug-float-status',
    'message-dialog': 'desktop-message-dialog',
    'message-title': 'desktop-message-title',
    'message-text': 'desktop-message-text',
    'message-close': 'desktop-message-close',
    'debug-dialog': 'desktop-debug-dialog',
    'debug-dialog-title': 'desktop-debug-dialog-title',
    'debug-password': 'desktop-debug-password',
    'debug-cancel': 'desktop-debug-cancel',
    'debug-confirm': 'desktop-debug-confirm',
    'debug-change-password': 'desktop-debug-change-password',
    'debug-password-dialog': 'desktop-debug-password-dialog',
    'debug-password-title': 'desktop-debug-password-title',
    'debug-old-password': 'desktop-debug-old-password',
    'debug-new-password': 'desktop-debug-new-password',
    'debug-password-cancel': 'desktop-debug-password-cancel',
    'debug-password-save': 'desktop-debug-password-save'
  };
  const $ = id => document.getElementById(id) || document.getElementById(ID_ALIASES[id]);
  const GUIDE_KEY = 'quakeGuideSeen';
  const GUIDE_COOKIE = 'qs_guide_seen';
  const MIN_HEALTHY_SOURCE_COUNT = 4;
  const SOURCE_SNAPSHOT_MAX_AGE_MS = 30000;
  const CHINA_ADMIN_PREFIXES = [
    '内蒙古自治区', '广西壮族自治区', '西藏自治区', '宁夏回族自治区', '新疆维吾尔自治区',
    '香港特别行政区', '澳门特别行政区', '黑龙江省', '北京市', '天津市', '上海市', '重庆市',
    '河北省', '山西省', '辽宁省', '吉林省', '江苏省', '浙江省', '安徽省', '福建省', '江西省',
    '山东省', '河南省', '湖北省', '湖南省', '广东省', '海南省', '四川省', '贵州省', '云南省',
    '陕西省', '甘肃省', '青海省', '台湾省', '内蒙古', '黑龙江', '北京', '天津', '上海', '重庆',
    '河北', '山西', '辽宁', '吉林', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北',
    '湖南', '广东', '广西', '海南', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏',
    '新疆', '香港', '澳门', '台湾'
  ];
  const FAULT_BELT_LOCATIONS = [
    { location: '四川甘孜州康定市', lat: 30.05, lon: 101.96 },
    { location: '四川雅安市芦山县', lat: 30.30, lon: 103.00 },
    { location: '云南昭通市鲁甸县', lat: 27.10, lon: 103.30 },
    { location: '甘肃临夏州积石山县', lat: 35.70, lon: 102.79 },
    { location: '青海海北州门源县', lat: 37.77, lon: 101.26 },
    { location: '新疆阿克苏地区乌什县', lat: 41.26, lon: 78.63 },
    { location: '西藏日喀则市定日县', lat: 28.50, lon: 87.45 }
  ];
  const THEME_TRANSITION_MS = 180;
  let themeTransitionTimer = null;
  const storage = window.SecureStorage;
  let guideIndex = 0;
  let guideOverlay = null;
  let guideTarget = null;
  let guideResizeFrame = 0;
  let debugEnabled = false;
  let debugPanelDrag = null;

  async function secureGet(key, fallback = '') {
    try {
      const value = storage ? await storage.getItem(key) : null;
      return value === null || value === undefined ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function secureSet(key, value) {
    if (storage) storage.setItem(key, String(value)).catch(() => {});
  }

  async function requiredGet(key, fallback = '') {
    try {
      const reader = storage && (storage.getRequiredItem || storage.getItem);
      const value = reader ? await reader(key) : null;
      return value === null || value === undefined ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function requiredSet(key, value) {
    const writer = storage && (storage.setRequiredItem || storage.setItem);
    if (writer) writer(key, String(value)).catch(() => {});
  }

  function secureRemove(key) {
    if (storage) storage.removeItem(key);
  }

  function hasLocalCookie() {
    return document.cookie.split(';').some(item => item.trim().startsWith(`${GUIDE_COOKIE}=`));
  }

  function writeEssentialCookie(name, value) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  }

  function themeByLocalTime() {
    const hour = new Date().getHours();
    return hour >= 8 && hour < 19 ? 'light' : 'dark';
  }

  function detectPreferredTheme() {
    if (window.matchMedia) {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    }
    return themeByLocalTime();
  }

  function resolveThemeMode(mode) {
    return mode === 'dark' || mode === 'light' ? mode : detectPreferredTheme();
  }

  function readThemeMode() {
    const params = new URLSearchParams(window.location.search);
    const theme = params.get('theme');
    return theme === 'dark' || theme === 'light' ? theme : 'system';
  }

  function readTheme() {
    return resolveThemeMode(readThemeMode());
  }

  function readMapSource() {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('map') || 'auto';
    return MAP_SOURCES.some(source => source.key === key) ? key : 'auto';
  }

  function readNotificationThreshold() {
    return 3;
  }

  async function loadPrivateSettings() {
    if (storage && storage.ready) await storage.ready;
    const params = new URLSearchParams(window.location.search);
    const storedCountry = (await secureGet('quakeCountryUserSelected', 'false')) === 'true' ? await secureGet('quakeCountry', '') : '';
    state.hasStoredCountry = Boolean(storedCountry);
    state.countryKey = storedCountry || state.countryKey;
    state.regionKey = await secureGet('quakeRegion', state.regionKey);
    if (legacyChinaRegions[state.countryKey]) {
      state.regionKey = legacyChinaRegions[state.countryKey];
      state.countryKey = 'CN_MAINLAND';
      secureSet('quakeCountry', state.countryKey);
      secureSet('quakeRegion', state.regionKey);
    }
    const urlTheme = params.get('theme');
    if (urlTheme === 'dark' || urlTheme === 'light') {
      state.themeMode = urlTheme;
      state.theme = urlTheme;
    } else {
      const storedThemeMode = await secureGet('quakeThemeMode', 'system');
      state.themeMode = ['system', 'dark', 'light'].includes(storedThemeMode) ? storedThemeMode : 'system';
      state.theme = resolveThemeMode(state.themeMode);
    }
    const storedMap = await secureGet('quakeMapSource', state.mapSourceKey);
    if (!params.get('map')) state.mapSourceKey = MAP_SOURCES.some(source => source.key === storedMap) ? storedMap : 'amap';
    state.notificationThreshold = clampNotificationThreshold(await requiredGet('quakeNotificationThreshold', await secureGet('quakeIntensityThreshold', '3')));
    state.mapToken = params.get('tk') || params.get('tiandituToken') || await secureGet('tiandituToken', '');
    state.desktopNotificationsEnabled = (await requiredGet('quakeDesktopNotifications', 'false')) === 'true';
    state.notificationArea = readNotificationArea(await requiredGet('quakeNotificationArea', '{}'));
    state.autoLocationRequested = (await secureGet('quakeLocationAutoRequested', 'false')) === 'true';
    if (state.userLocation.source !== 'url') {
      try {
        const storedLocation = JSON.parse(await secureGet('quakeUserLocation', '{}'));
        if (isUsableLocation(storedLocation.lat, storedLocation.lon)) {
          state.userLocation = {
            lat: Number(storedLocation.lat),
            lon: Number(storedLocation.lon),
            place: standardizePlaceName(storedLocation.place) || '上次定位',
            source: storedLocation.source === 'browser' ? 'browser' : 'stored'
          };
        }
      } catch (_error) {
        secureRemove('quakeUserLocation');
      }
    }
  }

  function readNotificationArea(value) {
    try {
      const area = JSON.parse(value || '{}');
      return {
        country: area.country || state.countryKey || 'CN_MAINLAND',
        region: area.region || 'all',
        province: area.province || 'all',
        city: area.city || 'all',
        district: area.district || 'all'
      };
    } catch (_error) {
      return { country: 'CN_MAINLAND', region: 'all', province: 'all', city: 'all', district: 'all' };
    }
  }

  function readUserLocation() {
    const params = new URLSearchParams(window.location.search);
    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    const hasUrlLocation = params.has('lat') && params.has('lon') && isUsableLocation(lat, lon);
    return {
      lat: hasUrlLocation ? lat : null,
      lon: hasUrlLocation ? lon : null,
      place: hasUrlLocation ? standardizePlaceName(params.get('place')) || '用户位置' : '',
      source: hasUrlLocation ? 'url' : 'unavailable'
    };
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value === undefined || value === null || value === '' ? '--' : String(value);
  }

  function splitChineseAdministrativeUnits(value) {
    const groups = String(value || '').trim().split(/\s*(?:,|，|、|\/|\||·)\s*/).filter(Boolean);
    const result = [];
    for (const group of groups) {
      let remaining = group;
      const prefix = CHINA_ADMIN_PREFIXES.find(item => remaining.startsWith(item));
      if (prefix) {
        result.push(prefix);
        remaining = remaining.slice(prefix.length);
      }
      while (remaining) {
        const match = remaining.match(/^(.+?(?:特别行政区|自治州|自治区|地区|自治县|州|县|市|区|盟|旗|乡|镇|街道|村))/);
        if (!match) break;
        result.push(match[1]);
        remaining = remaining.slice(match[1].length);
      }
      if (remaining) result.push(remaining);
    }
    return result.length ? result : [String(value || '--')];
  }

  function renderAlertTitle(event, location, magnitude) {
    const node = $('latest-location');
    if (!node) return;
    const english = Boolean(window.QuakeI18n && window.QuakeI18n.isEnglish);
    const taiwanLayout = taiwanLocationLayout(location, event);
    const translatedLocation = english && window.QuakeI18n ? window.QuakeI18n.t(location) : location;
    const rawUnits = splitChineseAdministrativeUnits(location);
    const units = english && window.QuakeI18n ? rawUnits.map(unit => window.QuakeI18n.t(unit)) : rawUnits;
    const place = taiwanLayout ? translatedLocation : units.join(english ? ', ' : '');
    const magnitudeValue = Number.isFinite(Number(magnitude)) ? Number(magnitude).toFixed(1) : '--';
    const placeNode = document.createElement('span');
    placeNode.className = 'alert-title-place';
    if (taiwanLayout) {
      placeNode.classList.add('is-taiwan-location');
      const englishParts = String(translatedLocation).match(/^(.*?)\s*(\([^()]+\))$/);
      const lines = english
        ? englishParts ? [englishParts[1].trim(), englishParts[2]] : [translatedLocation]
        : taiwanLayout.lines;
      lines.filter(Boolean).forEach(line => {
        const lineNode = document.createElement('span');
        lineNode.className = 'alert-title-line';
        lineNode.textContent = line;
        placeNode.appendChild(lineNode);
      });
    } else {
      units.forEach((unit, index) => {
        const unitNode = document.createElement('span');
        unitNode.className = 'alert-title-unit';
        if (english && index < units.length - 1) unitNode.classList.add('has-separator');
        unitNode.textContent = english && index < units.length - 1 ? `${unit},` : unit;
        placeNode.appendChild(unitNode);
        if (index < units.length - 1) placeNode.appendChild(document.createElement('wbr'));
      });
    }
    const magnitudeNode = document.createElement('span');
    magnitudeNode.className = 'alert-title-magnitude';
    magnitudeNode.textContent = english ? `M${magnitudeValue} earthquake` : `${magnitudeValue} 级地震`;
    node.replaceChildren(...(english ? [magnitudeNode, placeNode] : [placeNode, magnitudeNode]));
    node.setAttribute('aria-label', english ? `M${magnitudeValue} earthquake, ${place}` : `${location} ${magnitudeValue}级地震`);
    scheduleAlertPanelFit();
  }

  let alertPanelFitFrame = 0;

  function fitAlertPanelNow() {
    const title = $('latest-location');
    const availableWidth = title ? title.clientWidth : 0;
    if (title && availableWidth) {
      const taiwanPlace = title.querySelector('.alert-title-place.is-taiwan-location');
      if (taiwanPlace) {
        taiwanPlace.style.fontSize = '';
        const baseSize = Number.parseFloat(window.getComputedStyle(title).fontSize) || 24;
        const widestLine = Array.from(taiwanPlace.querySelectorAll('.alert-title-line'))
          .reduce((width, line) => Math.max(width, line.scrollWidth), 0);
        if (widestLine > availableWidth) {
          taiwanPlace.style.fontSize = `${Math.max(18, Math.floor(baseSize * availableWidth / widestLine))}px`;
        }
      } else {
        title.querySelectorAll('.alert-title-unit').forEach(unit => {
          unit.style.fontSize = '';
          const baseSize = Number.parseFloat(window.getComputedStyle(title).fontSize) || 24;
          if (unit.scrollWidth > availableWidth) {
            unit.style.fontSize = `${Math.max(12, Math.floor(baseSize * availableWidth / unit.scrollWidth))}px`;
          }
        });
      }
    }
    document.querySelectorAll('.alert-panel .detail-grid dd').forEach(detail => {
      detail.style.fontSize = '';
      detail.style.lineHeight = '';
      const card = detail.parentElement;
      let size = Number.parseFloat(window.getComputedStyle(detail).fontSize) || 14;
      while (card && (
        card.scrollHeight > card.clientHeight + 1
        || detail.scrollHeight > detail.clientHeight + 1
      ) && size > 11) {
        size -= 1;
        detail.style.fontSize = `${size}px`;
      }
      if (card && card.scrollHeight > card.clientHeight + 1) detail.style.lineHeight = '1.2';
    });
  }

  function scheduleAlertPanelFit() {
    if (alertPanelFitFrame) return;
    alertPanelFitFrame = window.requestAnimationFrame(() => {
      alertPanelFitFrame = 0;
      fitAlertPanelNow();
    });
  }

  function settleAlertPanelFit() {
    fitAlertPanelNow();
    window.setTimeout(scheduleAlertPanelFit, 80);
  }

  function setHtml(id, value) {
    const node = $(id);
    if (node) node.innerHTML = value === undefined || value === null || value === '' ? '--' : String(value);
  }

  function setDataStatus(status) {
    state.dataStatus = ['connecting', 'ready', 'error'].includes(status) ? status : 'connecting';
    if (document.body) document.body.dataset.dataState = state.dataStatus;
  }

  function showMapRuntimeStatus(message, caption = '') {
    const status = $('desktop-map-runtime-status');
    if (status) status.classList.remove('is-hidden');
    setText('map-hint', message);
    if (caption) setText('map-source-status', caption);
  }

  function hideMapRuntimeStatus() {
    const status = $('desktop-map-runtime-status');
    if (status) status.classList.add('is-hidden');
  }

  function wsUrl() {
    return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
  }

  async function loadSourceSnapshot(force = false) {
    const now = Date.now();
    if (!force && now - state.lastSourceFallbackAt < 15000) return false;
    state.lastSourceFallbackAt = now;
    try {
      const response = await fetch('/sources', {
        cache: 'no-store',
        signal: requestTimeoutSignal(8000)
      });
      if (!response.ok) throw new Error(`信源接口 HTTP ${response.status}`);
      const payload = await response.json();
      const sources = Array.isArray(payload.sources) ? payload.sources : [];
      state.hasSourceSnapshot = true;
      state.sourceSnapshotAt = Date.now();
      state.sources.clear();
      sources.forEach(source => {
        if (source && source.key) state.sources.set(String(source.key).slice(0, 64), source);
      });
      renderSourceStatus();
      return true;
    } catch (_error) {
      if (!hasFreshSourceSnapshot()) state.hasSourceSnapshot = false;
      renderSourceStatus();
      return false;
    }
  }

  function hasFreshSourceSnapshot() {
    return state.hasSourceSnapshot
      && state.sourceSnapshotAt > 0
      && Date.now() - state.sourceSnapshotAt <= SOURCE_SNAPSHOT_MAX_AGE_MS;
  }

  function clearWsHelloTimer() {
    if (state.wsHelloTimer) window.clearTimeout(state.wsHelloTimer);
    state.wsHelloTimer = null;
  }

  async function loadConfig() {
    const params = new URLSearchParams(window.location.search);
    const bootstrapConfig = window.__QUAKE_CONFIG__ && typeof window.__QUAKE_CONFIG__ === 'object'
      ? window.__QUAKE_CONFIG__
      : {};
    let serverConfig = bootstrapConfig;
    if (!Object.keys(bootstrapConfig).length) {
      try {
        const response = await fetch('/config', { cache: 'no-store', credentials: 'same-origin' });
        serverConfig = response.ok ? await response.json() : {};
      } catch (_error) {
        serverConfig = {};
      }
    }
    state.mapConfig = { ...bootstrapConfig, ...serverConfig };
    window.__QUAKE_CONFIG__ = state.mapConfig;
    if (state.mapConfig.clientCountryCode) {
      state.geoCountryCode = String(state.mapConfig.clientCountryCode).toUpperCase();
    }
    if (
      state.mapConfig.yandexQuotaExhausted &&
      (state.mapSourceKey === 'auto' || state.mapSourceKey === 'yandex')
    ) {
      state.mapSourceKey = 'google';
      state.pendingMapNotice = 'Yandex 今日 100 次额度已用完，已自动切换到 Google 地图';
    } else if (state.mapSourceKey === 'yandex' && !state.mapConfig.yandexMapsAvailable) {
      state.mapSourceKey = 'auto';
      secureSet('quakeMapSource', state.mapSourceKey);
    }
    state.mapToken =
      params.get('tk') ||
      params.get('tiandituToken') ||
      state.mapToken ||
      state.mapConfig.tiandituToken ||
      '';
    prepareInitialMapProvider();
  }

  async function loadUserContext() {
    if (state.userLocation.source !== 'url') {
      const sourceAtStart = state.userLocation.source;
      const geoInfo = await detectGeoInfo();
      if (geoInfo.countryCode) state.geoCountryCode = geoInfo.countryCode;
      state.geoRegionName = geoInfo.region;
      if (state.userLocation.source === 'browser' && sourceAtStart !== 'browser') return;
      if (!isUsableLocation(geoInfo.lat, geoInfo.lon)) {
        if (!hasUserLocation()) state.userLocation = { lat: null, lon: null, place: '', source: 'unavailable' };
        updateUserLocationMarker();
        return;
      }
      state.userLocation = {
        lat: geoInfo.lat,
        lon: geoInfo.lon,
        place: standardizePlaceName(geoInfo.place) || [geoInfo.city, geoInfo.region, geoInfo.countryName].map(standardizePlaceName).filter(Boolean).join(' ') || '市政府位置',
        source: 'ip'
      };
      persistUserLocation();
      updateUserLocationMarker();
      renderLatestEvent();
      sendAreaFilter();
    }
  }

  function initialMapCountryCode() {
    const detected = String(state.geoCountryCode || state.mapConfig.clientCountryCode || '').toUpperCase();
    if (detected) return detected;
    if (state.countryKey === 'CN_MAINLAND') return 'CN';
    return /^[A-Z]{2}$/.test(String(state.countryKey || '')) ? state.countryKey : '';
  }

  function mapProviderOptions() {
    return {
      config: state.mapConfig,
      token: state.mapToken,
      countryCode: initialMapCountryCode()
    };
  }

  function prepareInitialMapProvider() {
    if (!window.OfficialMap || typeof window.OfficialMap.prepare !== 'function') return;
    window.OfficialMap.prepare(state.mapSourceKey || 'auto', mapProviderOptions()).catch(() => {});
  }

  function initMapMetricLayout() {
    const stage = $('map-stage');
    if (!stage) return;
    let frame = 0;
    let compact = null;
    const update = () => {
      frame = 0;
      const rect = stage.getBoundingClientRect();
      const nextCompact = rect.width > 0 && (rect.width < 760 || rect.height < 300);
      if (nextCompact === compact) return;
      compact = nextCompact;
      document.body.classList.toggle('map-metrics-in-detail', compact);
      stage.dataset.metricsLayout = compact ? 'detail' : 'overlay';
      scheduleAlertPanelFit();
    };
    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(schedule);
      observer.observe(stage);
    }
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
  }

  async function detectGeoInfo() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch('/ip-location', { signal: controller.signal, cache: 'no-store' });
      const data = response.ok ? await response.json() : {};
      return {
        countryCode: String(data.country_code || '').toUpperCase(),
        countryName: data.country_name || '',
        region: data.region || '',
        city: data.city || '',
        place: data.place || '',
        lat: Number(data.lat ?? data.latitude),
        lon: Number(data.lon ?? data.longitude)
      };
    } catch (_error) {
      return { countryCode: '', countryName: '', region: '', city: '', lat: NaN, lon: NaN };
    } finally {
      clearTimeout(timer);
    }
  }

  function getBrowserLocationOnce() {
    if (hasUserLocation() && state.userLocation.source === 'browser') return Promise.resolve(state.userLocation);
    if (state.browserLocationPromise) return state.browserLocationPromise;
    if (!navigator.geolocation) return Promise.resolve(null);
    const request = new Promise(resolve => {
      const onSuccess = position => {
        if (!isUsableLocation(position.coords.latitude, position.coords.longitude)) {
          resolve(null);
          return;
        }
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          place: '浏览器定位',
          source: 'browser'
        });
      };
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    });
    state.browserLocationPromise = request;
    request.then(result => {
      if (!result && state.browserLocationPromise === request) state.browserLocationPromise = null;
    });
    return request;
  }

  async function primeBrowserLocation() {
    if (state.autoLocationRequested || state.userLocation.source === 'url' || state.userLocation.source === 'browser') return;
    state.autoLocationRequested = true;
    secureSet('quakeLocationAutoRequested', 'true');
    const browserLocation = await getBrowserLocationOnce();
    if (!browserLocation) return;
    state.userLocation = browserLocation;
    await resolveDesktopAdminLocation();
    persistUserLocation();
    updateUserLocationMarker();
    setText('summary-focus', state.userLocation.place || '浏览器定位');
    renderLatestEvent();
    sendAreaFilter();
  }

  function persistUserLocation() {
    if (!hasUserLocation()) return;
    secureSet('quakeUserLocation', JSON.stringify({
      lat: Number(state.userLocation.lat),
      lon: Number(state.userLocation.lon),
      place: state.userLocation.place || '',
      source: state.userLocation.source || 'stored'
    }));
  }

  async function resolveDesktopAdminLocation() {
    const lat = Number(state.userLocation.lat);
    const lon = Number(state.userLocation.lon);
    if (!isUsableLocation(lat, lon)) return;
    try {
      const response = await fetch(`/reverse-location?${new URLSearchParams({ lat: String(lat), lon: String(lon) })}`, { cache: 'no-store' });
      const data = response.ok ? await response.json() : {};
      const place = standardizePlaceName(data.place);
      if (place) state.userLocation = { ...state.userLocation, place, adminPlace: place };
    } catch (_error) {
      // 反查失败时保留坐标用于波到达和烈度估算。
    }
  }

  function findAreaByCountryCode(countryCode) {
    const direct = AREA_OPTIONS.find(item => item.key === countryCode);
    return direct ? direct.key : 'GLOBAL';
  }

  async function initMap() {
    showMapRuntimeStatus('地图加载中', '正在连接地图服务');
    if (!window.OfficialMap || typeof window.OfficialMap.create !== 'function') {
      showMapRuntimeStatus('地图适配器未加载，请刷新页面重试', '加载失败');
      return;
    }
    bindMapFocusControls();
    await renderOfficialMapLayer();
  }

  async function renderOfficialMapLayer() {
    const loadId = ++state.mapLoadId;
    const requested = state.mapSourceKey || 'auto';
    const options = mapProviderOptions();
    const availability = window.OfficialMap.availability(requested, options);
    renderMapSourceButtons();
    updateTokenVisibility();
    if (requested !== 'auto' && !availability.available) {
      const message = requested === 'tianditu'
        ? '请输入天地图 token 后重试'
        : availability.reason;
      showMapRuntimeStatus(message, '地图源未配置');
      return;
    }
    const candidates = window.OfficialMap.candidates(requested, options);
    if (!candidates.length) {
      showMapRuntimeStatus('暂无可用地图源，请检查地图配置', '加载失败');
      return;
    }
    const initialView = selectedMapView();
    destroyCurrentMap();
    const stage = $('map-stage');
    let lastError = '';
    for (const sourceKey of candidates) {
      const source = MAP_SOURCES.find(item => item.key === sourceKey);
      const label = source ? source.label : sourceKey;
      if (stage) stage.dataset.mapSource = sourceKey;
      showMapRuntimeStatus('正在加载' + label + '官方地图', '地图加载中');
      try {
        const map = await window.OfficialMap.create(sourceKey, 'map', {
          ...options,
          center: initialView.center,
          zoom: initialView.zoom
        });
        if (loadId !== state.mapLoadId) {
          map.destroy();
          return;
        }
        state.map = map;
        state.activeMapSource = sourceKey;
        state.lastUsableMapSource = sourceKey;
        state.mapHasLoaded = true;
        setText('map-source-status', label);
        hideMapRuntimeStatus();
        updateSelectedMap();
        flushPendingMapNotice();
        if (!selectedLatestEvent()) fitSelectedArea();
        return;
      } catch (error) {
        if (error && error.code === 'quota_exhausted' && error.fallback === 'google') {
          fallbackFromYandexQuota();
          return;
        }
        lastError = String(error && error.message || '地图加载失败');
        if (requested !== 'auto') break;
      }
    }
    if (loadId !== state.mapLoadId) return;
    state.mapHasLoaded = false;
    showMapRuntimeStatus(lastError || '地图服务暂时不可用，请稍后重试', '加载失败');
  }

  function selectedMapView() {
    const event = selectedLatestEvent();
    if (event && Number.isFinite(Number(event.latitude)) && Number.isFinite(Number(event.longitude))) {
      return {
        center: [Number(event.latitude), Number(event.longitude)],
        zoom: Number(event.magnitude) >= 5 ? 6 : 5
      };
    }
    return { center: [35.8, 104.2], zoom: 4 };
  }

  function destroyCurrentMap() {
    if (state.epicenterSync && state.map) {
      state.map.off('move zoom moveend zoomend resize', state.epicenterSync);
      window.removeEventListener('resize', state.epicenterResizeSync || state.epicenterSync);
    }
    state.epicenterSync = null;
    state.epicenterResizeSync = null;
    if (state.marker) state.marker.remove();
    if (state.userMarker) state.userMarker.remove();
    if (state.circle) state.circle.remove();
    state.marker = null;
    state.userMarker = null;
    state.circle = null;
    if (state.map && typeof state.map.destroy === 'function') state.map.destroy();
    state.map = null;
    state.mapHasLoaded = false;
    const epicenter = $('desktop-epicenter');
    if (epicenter) epicenter.classList.add('is-hidden');
  }

  function updateMapEpicenter(event) {
    if (!event || !Number.isFinite(Number(event.latitude)) || !Number.isFinite(Number(event.longitude))) {
      clearMapEpicenter();
      if (event) showMapRuntimeStatus('当前事件缺少震中坐标', state.activeMapSource || '地图已加载');
      else if (state.mapHasLoaded) hideMapRuntimeStatus();
      return;
    }
    if (state.mapHasLoaded) hideMapRuntimeStatus();
    const latlng = [Number(event.latitude), Number(event.longitude)];
    const magnitude = Number(event.magnitude) || 3;
    const intensity = intensityColor(epicenterIntensity(event));
    const icon = window.OfficialMap.divIcon({
      className: 'quake-map-anchor',
      html: '<span class="quake-map-ring ring-one"></span><span class="quake-map-ring ring-two"></span><span class="quake-map-dot"></span>',
      iconSize: [150, 150],
      iconAnchor: [75, 75]
    });

    if (!state.marker) {
      state.marker = window.OfficialMap.marker(latlng, { icon, interactive: false }).addTo(state.map);
    } else {
      state.marker.setLatLng(latlng);
      state.marker.setIcon(icon);
    }

    if (state.circle) {
      state.circle.remove();
      state.circle = null;
    }

    if (state.mapFocusTarget !== 'user') {
      state.map.flyTo(latlng, magnitude >= 5 ? 6 : 5, { animate: true, duration: 0.8 });
    }
    state.marker.bindPopup(detailPopupHtml(event, intensity));
    updateUserLocationMarker();
    syncDesktopEpicenterOverlay(latlng, event, intensity);
  }

  function updateUserLocationMarker() {
    if (!state.map) return;
    if (!hasUserLocation()) {
      if (state.userMarker) {
        state.userMarker.remove();
        state.userMarker = null;
      }
      return;
    }
    const latlng = [Number(state.userLocation.lat), Number(state.userLocation.lon)];
    const icon = window.OfficialMap.divIcon({
      className: 'user-location-marker',
      html: '<span></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    if (!state.userMarker) state.userMarker = window.OfficialMap.marker(latlng, { icon, interactive: false }).addTo(state.map);
    else state.userMarker.setLatLng(latlng).setIcon(icon);
  }

  function bindMapFocusControls() {
    if (bindMapFocusControls.bound) return;
    bindMapFocusControls.bound = true;
    document.querySelectorAll('[data-map-focus]').forEach(button => {
      button.addEventListener('click', () => focusMapPoint(button.dataset.mapFocus, button));
    });
  }

  async function focusMapPoint(target, trigger) {
    if (!state.map) {
      showMapSourceNotice('地图尚未加载完成，请稍后重试');
      return;
    }
    const focusRequestId = ++state.mapFocusRequestId;
    state.mapFocusTarget = target;
    setMapFocusSelection(target);
    if (target === 'user') {
      if (trigger) {
        trigger.disabled = true;
        trigger.setAttribute('aria-busy', 'true');
      }
      const alreadyPrecise = hasUserLocation() && state.userLocation.source === 'browser';
      const browserLocationPromise = alreadyPrecise ? Promise.resolve(null) : getBrowserLocationOnce();
      if (hasUserLocation()) {
        centerDesktopUserLocation(alreadyPrecise ? '已将您的位置移到地图中心' : '已显示估算位置，正在更新精确定位', false);
      } else if (state.userContextPromise) {
        await Promise.race([state.userContextPromise, browserLocationPromise]);
        if (focusRequestId === state.mapFocusRequestId && hasUserLocation()) {
          centerDesktopUserLocation('已显示估算位置，正在更新精确定位', false);
        }
      }
      const browserLocation = await browserLocationPromise;
      if (browserLocation) {
        state.userLocation = browserLocation;
        await resolveDesktopAdminLocation();
        persistUserLocation();
        setText('summary-focus', state.userLocation.place || '浏览器定位');
        updateUserLocationMarker();
        sendAreaFilter();
        renderLatestEvent();
      }
      if (!browserLocation && !hasUserLocation() && state.userContextPromise) {
        await state.userContextPromise;
      }
      if (focusRequestId === state.mapFocusRequestId && hasUserLocation()) {
        centerDesktopUserLocation(browserLocation
          ? '定位成功，已将您的位置移到地图中心'
          : alreadyPrecise
            ? '已将您的位置移到地图中心'
            : '未获得精确定位权限，已显示估算位置', Boolean(browserLocation));
      } else if (focusRequestId === state.mapFocusRequestId) {
        showMapSourceNotice('无法获取您的位置，请检查浏览器定位权限');
      }
      if (trigger) {
        trigger.disabled = false;
        trigger.removeAttribute('aria-busy');
      }
      return;
    }
    const event = selectedLatestEvent();
    if (event && Number.isFinite(Number(event.latitude)) && Number.isFinite(Number(event.longitude))) {
      state.map.flyTo([Number(event.latitude), Number(event.longitude)], Math.max(state.map.getZoom(), Number(event.magnitude) >= 5 ? 6 : 5), { animate: true, duration: 0.55 });
      showMapSourceNotice('已将震中移到地图中心');
    } else {
      showMapSourceNotice('当前事件缺少震中坐标');
    }
  }

  function centerDesktopUserLocation(message, animate) {
    if (!state.map || !hasUserLocation()) return;
    updateUserLocationMarker();
    const latlng = [Number(state.userLocation.lat), Number(state.userLocation.lon)];
    const zoom = Math.max(state.map.getZoom(), 8);
    if (animate) state.map.flyTo(latlng, zoom, { animate: true, duration: 0.35 });
    else state.map.setView(latlng, zoom);
    if (message) showMapSourceNotice(message);
  }

  function setMapFocusSelection(target) {
    document.querySelectorAll('[data-map-focus]').forEach(button => {
      const selected = button.dataset.mapFocus === target;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function syncDesktopEpicenterOverlay(latlng, event, intensity) {
    const stage = $('map-stage');
    const epicenter = $('desktop-epicenter');
    if (!stage || !epicenter || !state.map) return;
    if (state.epicenterSync) {
      state.map.off('move zoom moveend zoomend resize', state.epicenterSync);
      window.removeEventListener('resize', state.epicenterResizeSync || state.epicenterSync);
    }
    const sync = () => {
      if (!state.map || !stage.isConnected) return;
      const point = state.map.latLngToContainerPoint(latlng);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        epicenter.classList.add('is-hidden');
        return;
      }
      stage.style.setProperty('--desktop-epicenter-x', `${point.x}px`);
      stage.style.setProperty('--desktop-epicenter-y', `${point.y}px`);
      epicenter.classList.remove('is-hidden');
    };
    sync();
    state.epicenterSync = () => window.requestAnimationFrame(sync);
    state.epicenterResizeSync = () => {
      if (state.map) {
        state.map.invalidateSize({ pan: false });
        state.map.setView(latlng, state.map.getZoom(), { animate: false });
      }
      state.epicenterSync();
    };
    state.map.on('move zoom moveend zoomend resize', state.epicenterSync);
    window.addEventListener('resize', state.epicenterResizeSync);
    epicenter.setAttribute('aria-label', `震中 ${displayLocation(event)}`);
    setText('desktop-map-mag', formatNumber(event.magnitude, ' 级', 1));
    setMagnitudeTone('desktop-map-mag', event.magnitude);
    const intensityText = eventIntensityText(event);
    setText('desktop-map-intensity', intensityText.localShort);
  }

  function connect() {
    if (state.ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.ws.readyState)) return;
    clearWsHelloTimer();
    if (state.serverConnectionState !== 'disconnected') state.serverConnectionState = 'connecting';
    updateLiveChannelStatus();
    let ws;
    try {
      ws = new WebSocket(wsUrl());
    } catch (_error) {
      state.serverConnectionState = 'disconnected';
      updateLiveChannelStatus();
      setTimeout(connect, state.reconnectDelay);
      state.reconnectDelay = Math.min(15000, state.reconnectDelay * 1.6);
      return;
    }
    state.ws = ws;
    state.wsHelloTimer = window.setTimeout(() => loadSourceSnapshot(true), 6000);

    ws.onopen = () => {
      state.reconnectDelay = 1000;
      state.serverConnectionState = 'connected';
      updateLiveChannelStatus();
      sendAreaFilter();
    };

    ws.onmessage = message => {
      let payload;
      try {
        payload = JSON.parse(message.data);
      } catch (_error) {
        updateLiveChannelStatus();
        return;
      }
      if (payload.type === 'hello') {
        clearWsHelloTimer();
        setDataStatus('ready');
        state.hasSourceSnapshot = true;
        state.sourceSnapshotAt = Date.now();
        state.sources.clear();
        (Array.isArray(payload.sources) ? payload.sources : []).forEach(source => {
          if (source && source.key) state.sources.set(String(source.key).slice(0, 64), source);
        });
        (Array.isArray(payload.events) ? payload.events : []).slice().reverse().forEach(event => upsertEvent(event, true, true));
        renderSourceStatus();
        renderLatestEvent();
        renderEventList();
        return;
      }
      if (payload.type === 'history') {
        setDataStatus('ready');
        (Array.isArray(payload.events) ? payload.events : []).slice().reverse().forEach(event => upsertEvent(event, true, true));
        renderLatestEvent();
        renderEventList();
        return;
      }
      if (payload.type === 'source_status' && payload.source && payload.source.key) {
        state.hasSourceSnapshot = true;
        state.sourceSnapshotAt = Date.now();
        state.sources.set(payload.source.key, payload.source);
        renderSourceStatus();
        return;
      }
      if (payload.type === 'event') {
        upsertEvent(payload.event, Boolean(payload.isUpdate), false);
      }
    };

    ws.onerror = () => {
      state.serverConnectionState = 'disconnected';
      updateLiveChannelStatus();
      loadSourceSnapshot();
    };
    ws.onclose = () => {
      clearWsHelloTimer();
      state.serverConnectionState = 'disconnected';
      updateLiveChannelStatus();
      state.ws = null;
      loadSourceSnapshot();
      setTimeout(connect, state.reconnectDelay);
      state.reconnectDelay = Math.min(15000, state.reconnectDelay * 1.6);
    };
  }

  function setClientStatus(status, label) {
    const node = $('client-status');
    if (!node) return;
    const safeStatus = ['connected', 'connecting', 'reconnecting', 'error', 'closed'].includes(status) ? status : 'error';
    node.classList.remove('connected', 'warning', 'offline');
    node.classList.add(safeStatus === 'connected' ? 'connected' : ['error', 'closed'].includes(safeStatus) ? 'offline' : 'warning');
    const indicator = document.createElement('i');
    indicator.className = `status-dot status-${safeStatus}`;
    node.replaceChildren(indicator, document.createTextNode(String(label || '')));
  }

  function connectedSourceCount() {
    return ALL_SOURCES.reduce((count, source) => {
      const item = state.sources.get(source.key);
      return count + (item && item.status === 'connected' ? 1 : 0);
    }, 0);
  }

  function updateLiveChannelStatus() {
    const channel = liveChannelStatus(
      connectedSourceCount(),
      state.serverConnectionState,
      hasFreshSourceSnapshot(),
      MIN_HEALTHY_SOURCE_COUNT
    );
    setClientStatus(channel.status, channel.label);
  }

  function upsertEvent(event, isUpdate, silent, forceVisible = false) {
    if (!event || !isRealEarthquake(event)) return;
    const eventKey = event.eventKey || getEventKey(event);
    const next = { ...event, eventKey, debugForceVisible: forceVisible || Boolean(event.debugForceVisible) };
    const areaMatch = matchesArea(next, state.countryKey, state.regionKey);
    if (!areaMatch && !next.debugForceVisible) return;
    const index = state.events.findIndex(item => item.eventKey === eventKey);
    if (index >= 0) {
      state.events[index] = { ...state.events[index], ...next };
    } else {
      if (!silent && !isUpdate && next.isLive && !next.isHistory && Number(next.magnitude) > 5) next.flashUntil = Date.now() + 120000;
      if (!silent && !isUpdate && next.isLive && !next.isHistory) {
        state.mapFocusTarget = 'epicenter';
        state.mapFocusRequestId += 1;
        setMapFocusSelection('epicenter');
        if (window.QuakeVoice) window.QuakeVoice.announce(next);
      }
      state.events.unshift(next);
      state.events = state.events.slice(0, 30);
    }
    if ((areaMatch || next.debugForceVisible) && !state.areaEvents.some(item => (item.eventKey || getEventKey(item)) === eventKey)) {
      state.areaEvents.unshift(next);
      state.areaEvents = state.areaEvents.sort((a, b) => eventTime(b) - eventTime(a)).slice(0, 30);
    }
    renderLatestEvent();
    renderEventList();
    updateSelectedMap();
    if (!silent && !isUpdate && !next.isHistory) openMobileMap();
  }

  function renderLatestEvent() {
    const event = selectedLatestEvent();
    if (!event) {
      updatePageEventState(null, null);
      const connecting = state.dataStatus === 'connecting';
      setText('latest-source', connecting ? '连接中' : '等待数据');
      setText('latest-location', connecting ? '正在连接服务器中' : '当前区域暂无地震事件');
      setText('latest-magnitude', '-- 级');
      setText('summary-location', connecting ? '正在连接服务器中' : '当前区域暂无地震事件');
      setText('summary-source', connecting ? '正在获取服务器数据' : '等待数据源返回');
      setText('summary-mag', '-- 级');
      setText('summary-depth', '深度 --');
      setText('summary-distance', '--');
      setText('summary-intensity', '--');
      setText('summary-impact', '倒计时为估算');
      const emptyMagnitude = $('latest-magnitude');
      if (emptyMagnitude) emptyMagnitude.classList.remove('magnitude-alert-flash');
      setMagnitudeTone('latest-magnitude', null);
      setMagnitudeTone('desktop-map-mag', null);
      setHtml('latest-countdown', '--');
      setText('latest-depth', '--');
      setText('latest-coords', '--');
      setText('latest-origin', '--');
      setText('latest-received', '--');
      setText('latest-source-detail', '--');
      setText('latest-event-id', '--');
      setText('p-count', '--');
      setText('s-count', '--');
      setText('desktop-map-mag', '-- 级');
      setText('desktop-map-intensity', '烈度 --');
      setText('desktop-map-coords', '--');
      setText('desktop-map-radius', '--');
      setText('desktop-detail-coords', '--');
      setText('desktop-detail-radius', '--');
      setText('desktop-detail-sources', '--');
      setText('desktop-detail-action', '等待实时数据或服务器历史缓存。');
      setWaveCellState('p-count', null, null);
      setWaveCellState('s-count', null, null);
      updateDesktopIntensityScale(null);
      renderIntensityBadges(null);
      return;
    }
    const waves = estimateWaveCountdowns(event, hasUserLocation() ? state.userLocation : null);
    const location = displayLocation(event);
    const intensityText = eventIntensityText(event);
    const localIntensity = intensityText.local;
    const epicenterColor = intensityText.epicenter;
    const expiredLabel = event.isHistory ? '已结束' : '已到达';
    const magnitudeText = formatNumber(event.magnitude, ' 级', 1);
    updatePageEventState(event, waves);
    setText('latest-source', event.sourceLabel || event.source);
    renderAlertTitle(event, location, event.magnitude);
    setText('latest-magnitude', magnitudeText);
    setMagnitudeTone('latest-magnitude', event.magnitude);
    setText('summary-location', location);
    setText('summary-source', event.sourceLabel || event.source || '--');
    setText('summary-mag', magnitudeText);
    setText('summary-depth', `深度 ${formatNumber(event.depth, ' km', 0)}`);
    setText('summary-distance', Number.isFinite(Number(waves.distanceKm)) ? `${Math.round(Number(waves.distanceKm))} km` : '--');
    setText('summary-focus', state.userLocation.place || '点击获取定位');
    setText('summary-intensity', intensityText.localValue);
    setText('summary-impact', intensityText.localShort);
    const magnitudeNode = $('latest-magnitude');
    if (magnitudeNode) magnitudeNode.classList.toggle('magnitude-alert-flash', Number(event.flashUntil) > Date.now());
    setHtml('latest-countdown', waveCountdownHtml(waves, event));
    setText('latest-depth', formatNumber(event.depth, ' km', 0));
    setText('latest-coords', coordinateText(event));
    setText('latest-origin', detailTimeText(event.originTime));
    setText('latest-received', detailTimeText(event.receivedAt));
    setText('latest-source-detail', event.sourceLabel || event.source);
    setText('latest-event-id', event.eventId || event.eventKey || '--');
    setText('p-count', formatCountdown(waves.p, expiredLabel));
    setText('s-count', formatCountdown(waves.s, expiredLabel));
    setWaveCellState('p-count', waves.p, event);
    setWaveCellState('s-count', waves.s, event);
    setText('desktop-map-mag', magnitudeText);
    setMagnitudeTone('desktop-map-mag', event.magnitude);
    setText('desktop-map-intensity', intensityText.localShort);
    const radiusText = Number.isFinite(Number(waves.distanceKm)) ? `距关注地 ${Math.round(Number(waves.distanceKm))} km` : '传播半径估算中';
    setText('desktop-map-radius', radiusText);
    setText('desktop-detail-coords', coordinateText(event));
    setText('desktop-detail-radius', radiusText);
    setText('desktop-detail-sources', event.sourceLabel || event.source || '--');
    setText('desktop-detail-action', adviceText(event));
    updateDesktopIntensityScale(localIntensity.level || epicenterColor.level);
    renderIntensityBadges(event);
    settleAlertPanelFit();
  }

  function updatePageEventState(event, waves) {
    const body = document.body;
    if (!body) return;
    const stateName = state.dataStatus === 'connecting'
      ? 'connecting'
      : !event
      ? (state.historyError ? 'error' : 'empty')
      : event.isHistory
        ? 'history'
        : hasIncomingWave(waves)
          ? 'warning'
          : 'arrived';
    body.dataset.quakeState = stateName;
  }

  function hasIncomingWave(waves) {
    return Boolean(waves && [waves.p, waves.s].some(value => Number.isFinite(Number(value)) && Number(value) > 0));
  }

  function waveState(seconds, event) {
    if (event && event.isHistory) return 'history';
    if (!Number.isFinite(Number(seconds))) return 'unknown';
    return Number(seconds) > 0 ? 'incoming' : 'arrived';
  }

  function setWaveCellState(id, seconds, event) {
    const node = $(id);
    const cell = node && node.closest('.countdown-grid article');
    if (!cell) return;
    cell.classList.remove('is-hot', 'is-incoming', 'is-arrived', 'is-history', 'is-unknown');
    cell.classList.add(`is-${waveState(seconds, event)}`);
  }

  function adviceText(event) {
    const magnitude = Number(event && event.magnitude);
    if (Number.isFinite(magnitude) && magnitude >= 5) return '注意避险，远离玻璃、外墙和悬挂物';
    if (Number.isFinite(magnitude) && magnitude >= 4) return '保持关注，留意后续正式测定';
    return '低强度记录，继续监控后续数据';
  }

  function updateDesktopIntensityScale(level) {
    const nodes = Array.from(document.querySelectorAll('.intensity-scale span'));
    if (!nodes.length) return;
    const value = typeof level === 'number' ? level : ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'].indexOf(String(level).toUpperCase()) + 1;
    if (!value) {
      nodes.forEach(node => node.classList.remove('active'));
      return;
    }
    const index = value >= 10 ? 5 : value >= 8 ? 4 : value >= 6 ? 3 : value >= 4 ? 2 : value >= 2 ? 1 : 0;
    nodes.forEach((node, nodeIndex) => node.classList.toggle('active', nodeIndex === index));
  }

  function waveCountdownHtml(waves, event) {
    const expiredLabel = event && event.isHistory ? '已结束' : '已到达';
    return `
      <span><b>纵波(P)</b><em>${formatCountdown(waves.p, expiredLabel)}</em></span>
      <span><b>横波(S)</b><em>${formatCountdown(waves.s, expiredLabel)}</em></span>
    `;
  }

  function detailPopupHtml(event, intensity) {
    return `
      <strong>${escapeHtml(displayLocation(event))}</strong><br>
      震级：${formatNumber(event.magnitude, ' 级', 1)}<br>
      震中烈度：${escapeHtml(intensity.label)}<br>
      本地烈度：${escapeHtml(eventIntensityText(event).localValue)}<br>
      时间：${escapeHtml(formatTime(event.originTime))}
    `;
  }

  function displayLocation(event) {
    return standardizePlaceName(event && event.location) || '未知震中';
  }

  function detailTimeText(value) {
    return formatTimeWithZone(value, 'stacked');
  }

  function coordinateText(event) {
    return formatCoordinatePair(event.latitude, event.longitude, 3);
  }

  function renderIntensityBadges(event) {
    applyIntensityBadge('latest-epicenter-intensity', event ? epicenterIntensity(event) : '');
    applyIntensityBadge('latest-local-intensity', event ? localIntensity(event) : '');
  }

  function eventIntensityText(event) {
    return formatIntensitySummary(event, hasUserLocation() ? state.userLocation : null);
  }

  function applyIntensityBadge(id, intensity) {
    const badge = $(id);
    if (!badge) return;
    const color = intensityColor(intensity);
    badge.textContent = color.label;
    badge.style.background = color.background;
    badge.style.color = color.color;
    badge.style.borderColor = color.border;
  }

  function renderEventList() {
    const list = $('event-list');
    if (!list) return;
    if (state.dataStatus === 'connecting') {
      const empty = document.createElement('article');
      empty.className = 'empty-state is-connecting';
      empty.setAttribute('role', 'status');
      empty.textContent = '正在连接服务器中';
      list.replaceChildren(empty);
      return;
    }
    const oldPositions = captureListPositions(list, '.event', 'eventKey');
    const listReady = list.dataset.ready === 'true';
    const events = selectedAreaEvents();
    if (!events.length) {
      const message = state.historyError || '当前国家/地区暂无历史地震，正在等待数据源返回。';
      const empty = document.createElement('article');
      empty.className = 'empty-state';
      empty.textContent = message;
      list.replaceChildren(empty);
      list.dataset.ready = 'true';
      return;
    }
    const fragment = document.createDocumentFragment();
    events.forEach(event => {
      const strength = magnitudeIntensity(event.magnitude);
      const key = event.eventKey || getEventKey(event);
      const selected = key === state.selectedEventKey;
      const isNew = listReady && !oldPositions.has(key);
      const button = document.createElement('button');
      button.className = `event ${magnitudeBand(event.magnitude)}${selected ? ' active' : ''}${isNew ? ' is-new' : ''}`;
      button.type = 'button';
      button.dataset.eventKey = key;
      button.setAttribute('aria-label', `${displayLocation(event)}，${formatNumber(event.magnitude, '级', 1)}，${formatTime(event.originTime || event.receivedAt)}，${event.isLive ? '实时' : '历史'}地震`);
      const magnitude = document.createElement('strong');
      magnitude.textContent = formatNumber(event.magnitude, '', 1);
      const detail = document.createElement('div');
      const location = document.createElement('b');
      location.textContent = displayLocation(event);
      const meta = document.createElement('span');
      meta.textContent = `${formatTime(event.originTime || event.receivedAt)} · ${event.isLive ? '实时' : '历史'} · ${strength.label}`;
      detail.append(location, meta);
      button.append(magnitude, detail);
      fragment.appendChild(button);
    });
    list.replaceChildren(fragment);
    list.dataset.ready = 'true';
    animateListMoves(list, '.event', 'eventKey', oldPositions);
  }

  function captureListPositions(list, selector, keyName) {
    const positions = new Map();
    list.querySelectorAll(selector).forEach(item => {
      const key = item.dataset[keyName];
      if (key) positions.set(key, item.getBoundingClientRect().top);
    });
    return positions;
  }

  function animateListMoves(list, selector, keyName, oldPositions) {
    requestAnimationFrame(() => {
      list.querySelectorAll(selector).forEach(item => {
        const key = item.dataset[keyName];
        if (!key || !oldPositions.has(key)) return;
        const delta = oldPositions.get(key) - item.getBoundingClientRect().top;
        if (Math.abs(delta) < 1) return;
        item.style.transition = 'transform 0ms linear';
        item.style.transform = `translateY(${delta}px)`;
        requestAnimationFrame(() => {
          item.style.transition = 'transform 220ms linear, border-color 160ms linear, background 160ms linear';
          item.style.transform = '';
        });
      });
    });
  }

  function selectedAreaEvents() {
    const base = state.areaEvents.length ? state.areaEvents : state.events;
    const now = Date.now();
    return base
      .filter(event => event.debugForceVisible || matchesArea(event, state.countryKey, state.regionKey))
      .filter(event => eventTime(event) <= now)
      .sort((a, b) => eventTime(b) - eventTime(a))
      .slice(0, 30);
  }

  function magnitudeBand(magnitude) {
    const value = Number(magnitude);
    if (!Number.isFinite(value)) return 'low';
    if (value >= 5) return 'high';
    if (value >= 4) return 'mid';
    return 'low';
  }

  function setMagnitudeTone(id, magnitude) {
    const node = $(id);
    if (!node) return;
    node.classList.remove('magnitude-tone', 'low', 'mid', 'high');
    if (!Number.isFinite(Number(magnitude))) return;
    node.classList.add('magnitude-tone', magnitudeBand(magnitude));
  }

  function selectedLatestEvent() {
    const events = selectedAreaEvents();
    return events.find(event => (event.eventKey || getEventKey(event)) === state.selectedEventKey) || events[0] || null;
  }

  function updateSelectedMap() {
    if (!state.map) return;
    const event = selectedLatestEvent();
    if (event) updateMapEpicenter(event);
    else clearMapEpicenter();
  }

  function clearMapEpicenter() {
    if (state.epicenterSync && state.map) {
      state.map.off('move zoom moveend zoomend resize', state.epicenterSync);
      window.removeEventListener('resize', state.epicenterResizeSync || state.epicenterSync);
      state.epicenterSync = null;
      state.epicenterResizeSync = null;
    }
    if (state.marker) {
      state.marker.remove();
      state.marker = null;
    }
    if (state.circle) {
      state.circle.remove();
      state.circle = null;
    }
    const epicenter = $('desktop-epicenter');
    if (epicenter) epicenter.classList.add('is-hidden');
    setText('desktop-map-mag', '-- 级');
    setText('desktop-map-intensity', '烈度 --');
    updateUserLocationMarker();
  }

  function eventTime(event) {
    const parsed = Date.parse(event && (event.originTime || event.receivedAt));
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  async function loadAreaHistory() {
    if (!state.events.length) setDataStatus('connecting');
    try {
      state.historyError = '';
      const historyQuery = new URLSearchParams({
        country: state.countryKey,
        region: state.regionKey,
        limit: '30',
        refresh: '1'
      });
      if (hasUserLocation()) {
        historyQuery.set('lat', String(state.userLocation.lat));
        historyQuery.set('lon', String(state.userLocation.lon));
        historyQuery.set('place', state.userLocation.place || '用户位置');
      }
      const historyResponse = await fetch(`/history?${historyQuery}`, {
        cache: 'no-store',
        signal: requestTimeoutSignal(20000)
      });
      if (!historyResponse.ok) throw new Error(`历史接口 HTTP ${historyResponse.status}`);
      const historyData = historyResponse.ok ? await historyResponse.json() : {};
      let events = Array.isArray(historyData.events) ? historyData.events : [];
      if (hasUserLocation() && state.countryKey === 'CN_MAINLAND' && !events.filter(event => matchesArea(event, state.countryKey, state.regionKey)).length) {
        const nearbyQuery = new URLSearchParams({
          limit: '20',
          sort: 'time',
          lat: String(state.userLocation.lat),
          lon: String(state.userLocation.lon),
          place: state.userLocation.place
        });
        const nearbyResponse = await fetch(`/api/nearby-earthquakes?${nearbyQuery}`, {
          cache: 'no-store',
          signal: requestTimeoutSignal(12000)
        });
        if (!nearbyResponse.ok) throw new Error(`附近地震接口 HTTP ${nearbyResponse.status}`);
        const nearbyData = nearbyResponse.ok ? await nearbyResponse.json() : {};
        events = Array.isArray(nearbyData.data) ? nearbyData.data.map(nearbyApiEvent) : events;
      }
      setDataStatus('ready');
      replaceAreaEvents(events);
    } catch (_error) {
      state.historyError = '历史接口暂不可用，保留已接收的实时和缓存事件。';
      if (!state.events.length) setDataStatus('error');
      renderLatestEvent();
      renderEventList();
      updateSelectedMap();
    }
  }

  function nearbyApiEvent(event) {
    return {
      source: event.source || 'cenc_eqlist_api',
      sourceLabel: event.sourceLabel || '中国地震台网',
      eventId: event.eventId || event.no || '',
      location: standardizePlaceName(event.location || event.placeName) || '未知震中',
      magnitude: Number(event.magnitude),
      depth: event.depthKm ?? event.depth,
      latitude: Number(event.latitude),
      longitude: Number(event.longitude),
      intensity: event.intensity || '',
      originTime: event.originTime,
      receivedAt: event.receivedAt || new Date().toISOString(),
      isHistory: true,
      isLive: false,
      rawData: event.raw || event.rawData || event
    };
  }

  function requestTimeoutSignal(timeoutMs) {
    return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  }

  function replaceAreaEvents(events) {
    setDataStatus('ready');
    const accepted = events
      .filter(event => isRealEarthquake(event) && matchesArea(event, state.countryKey, state.regionKey))
      .map(event => ({ ...event, eventKey: event.eventKey || getEventKey(event) }));
    const byKey = new Map();
    for (const event of state.events.concat(accepted)) byKey.set(event.eventKey, event);
    state.events = Array.from(byKey.values())
      .sort((a, b) => eventTime(b) - eventTime(a))
      .slice(0, 30);
    state.areaEvents = state.events
      .filter(event => event.debugForceVisible || matchesArea(event, state.countryKey, state.regionKey))
      .sort((a, b) => eventTime(b) - eventTime(a))
      .slice(0, 30);
    if (state.selectedEventKey && !state.events.some(event => event.eventKey === state.selectedEventKey)) {
      state.selectedEventKey = '';
    }
    renderLatestEvent();
    renderEventList();
    updateSelectedMap();
  }

  function renderSourceStatus() {
    const list = $('source-status-list');
    if (!hasFreshSourceSnapshot()) {
      const summary = $('source-summary');
      const summaryText = $('source-summary-text');
      const summarySmall = $('source-summary-small');
      if (summary) {
        summary.classList.remove('connected', 'offline');
        summary.classList.add('warning');
      }
      if (summaryText) summaryText.textContent = '信源状态载入中';
      if (summarySmall) summarySmall.textContent = '等待更新';
      if (list) {
        list.innerHTML = ALL_SOURCES.map(source => `
          <li data-status="connecting">
            <span><i></i>${escapeHtml(source.label)}</span>
            <b>等待更新</b>
          </li>
        `).join('');
      }
      updateLiveChannelStatus();
      return;
    }
    const items = ALL_SOURCES.map(source => {
      const item = state.sources.get(source.key) || { label: source.label, status: 'closed', lastError: '' };
      const status = item.status || 'closed';
      return { source, item, status };
    });
    const activeItems = items.filter(item => item.status !== 'closed');
    const connected = activeItems.filter(item => item.status === 'connected').length;
    const activeTotal = activeItems.length;
    const summary = $('source-summary');
    const summaryText = $('source-summary-text');
    const summarySmall = $('source-summary-small');
    if (summary) {
      summary.classList.remove('connected', 'warning', 'offline');
      summary.classList.add(connected === 0 ? 'offline' : connected < MIN_HEALTHY_SOURCE_COUNT ? 'warning' : 'connected');
    }
    if (summaryText) summaryText.textContent = `信源在线 ${connected}/${activeTotal}`;
    if (summarySmall) summarySmall.textContent = `${connected}/${activeTotal} 在线`;
    updateLiveChannelStatus();
    if (!list) return;
    list.innerHTML = items.map(({ source, item, status }) => `
      <li data-status="${escapeAttr(status)}">
        <span><i></i>${escapeHtml(item.label || source.label)}</span>
        <b>${escapeHtml(sourceStatusLabel(status))}</b>
      </li>
    `).join('');
  }

  function refreshSourceHealth() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) loadSourceSnapshot();
    updateLiveChannelStatus();
  }

  function sourceStatusLabel(status) {
    return {
      connected: '已连接',
      connecting: '连接中',
      reconnecting: '重连中',
      error: '异常',
      closed: '已关闭'
    }[status] || '未知';
  }

  function testNotificationEvent() {
    const now = new Date().toISOString();
    const selected = selectedLatestEvent();
    if (selected) {
      return {
        ...selected,
        eventKey: `debug-background-${Date.now()}`,
        eventId: `debug-background-${Date.now()}`,
        receivedAt: now
      };
    }
    const epicenter = debugFaultLocation();
    return {
      eventKey: `debug-notification-${Date.now()}`,
      eventId: `debug-notification-${Date.now()}`,
      source: 'debug',
      sourceLabel: '调试测试',
      location: epicenter.location,
      magnitude: Math.max(4, state.notificationThreshold),
      depth: 12,
      latitude: epicenter.latitude,
      longitude: epicenter.longitude,
      intensity: 5,
      originTime: now,
      receivedAt: now,
      isLive: true,
      isHistory: false
    };
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function initControls() {
    state.theme = resolveThemeMode(state.themeMode);
    applyTheme(state.theme);
    const themeSwitch = $('theme-switch');
    if (themeSwitch) {
      themeSwitch.checked = state.theme === 'dark';
      themeSwitch.addEventListener('change', () => {
        state.themeMode = themeSwitch.checked ? 'dark' : 'light';
        state.theme = resolveThemeMode(state.themeMode);
        secureSet('quakeThemeMode', state.themeMode);
        secureSet('quakeTheme', state.theme);
        applyTheme(state.theme);
      });
    }
    initAutoTheme();
    const tokenInput = $('map-token');
    const saveToken = $('save-map-token');
    const mapSelect = $('map-source');
    const countrySelect = $('country-select');
    const regionSelect = $('region-select');
    const thresholdInput = $('intensity-threshold');
    const notificationToggle = $('notification-toggle');
    const voiceToggle = $('voice-toggle');
    const debugEnable = $('debug-enable');
    const debugFloatAddHistory = $('debug-float-add-history');
    const debugFloatCookieBar = $('debug-float-cookie-bar');
    const debugFloatTestNotification = $('debug-float-test-notification');
    const debugFloatTestPush = $('debug-float-test-push');
    const debugMobileCookieBar = $('debug-mobile-cookie-bar');
    const debugFloatExit = $('debug-float-exit');
    const messageClose = $('message-close');
    const settingsOpen = $('settings-open');
    const settingsOpenCompact = $('desktop-settings-open-compact');
    const settingsClose = $('settings-close');
    const settingsBackdrop = $('settings-backdrop');
    if (mapSelect) {
      mapSelect.innerHTML = MAP_SOURCES.map(source => {
        const unavailable = mapSourceDisabled(source.key);
        return `<option value="${escapeAttr(source.key)}"${unavailable ? ' disabled' : ''}>${escapeHtml(source.label)}</option>`;
      }).join('');
      mapSelect.value = state.mapSourceKey;
      mapSelect.addEventListener('change', () => {
        if (!activateMapSource(mapSelect.value)) mapSelect.value = state.mapSourceKey;
      });
    }
    const mapSourceButtons = $('desktop-map-source-buttons');
    if (mapSourceButtons) {
      renderMapSourceButtons();
      mapSourceButtons.addEventListener('click', event => {
        const button = event.target.closest('[data-map-source]');
        if (!button) return;
        activateMapSource(button.dataset.mapSource);
      });
    }
    if (countrySelect && regionSelect) {
      countrySelect.innerHTML = sortedAreaOptions()
        .map(area => `<option value="${area.key}">${area.flag ? `${area.flag} ` : ''}${area.label}</option>`)
        .join('');
      countrySelect.value = AREA_OPTIONS.some(area => area.key === state.countryKey) ? state.countryKey : 'CN_MAINLAND';
      state.countryKey = countrySelect.value;
      updateRegionOptions();
      countrySelect.addEventListener('change', () => {
        state.countryKey = countrySelect.value;
        state.regionKey = 'all';
        secureSet('quakeCountry', state.countryKey);
        secureSet('quakeRegion', state.regionKey);
        secureSet('quakeCountryUserSelected', 'true');
        updateRegionOptions();
        applyAreaChange();
      });
      regionSelect.addEventListener('change', () => {
        state.regionKey = regionSelect.value;
        secureSet('quakeRegion', state.regionKey);
        secureSet('quakeCountryUserSelected', 'true');
        applyAreaChange();
      });
    }
    if (thresholdInput) {
      thresholdInput.value = String(state.notificationThreshold);
      thresholdInput.addEventListener('change', () => {
        state.notificationThreshold = clampNotificationThreshold(thresholdInput.value);
        thresholdInput.value = String(state.notificationThreshold);
        requiredSet('quakeNotificationThreshold', String(state.notificationThreshold));
        if (state.webPushEnabled) {
          syncPushSubscription(false).then(ready => {
            if (ready) updateNotificationStatus();
            else updateNotificationStatus('推送条件待同步，将在网络恢复后自动重试');
          });
        }
      });
    }
    initNotificationControls(notificationToggle);
    initVoiceControls(voiceToggle);
    window.addEventListener('quake-yandex-quota', event => {
      state.mapConfig.yandexQuotaUsed = Number(event.detail && event.detail.used) || 0;
      state.mapConfig.yandexQuotaRemaining = Number(event.detail && event.detail.remaining) || 0;
      renderMapSourceButtons();
    });
    if (debugEnable) {
      debugEnable.addEventListener('click', () => {
        if (debugEnabled) showDebugPanel();
        else openDebugDialog();
      });
    }
    if (debugFloatAddHistory) debugFloatAddHistory.addEventListener('click', addDebugEarthquakeEvent);
    if (debugFloatCookieBar) debugFloatCookieBar.addEventListener('click', showDebugCookieBar);
    if (debugFloatTestNotification) debugFloatTestNotification.addEventListener('click', testDesktopNotification);
    if (debugFloatTestPush) debugFloatTestPush.addEventListener('click', testDesktopBackgroundPush);
    if (debugMobileCookieBar) debugMobileCookieBar.addEventListener('click', showDebugCookieBar);
    if (debugFloatExit) debugFloatExit.addEventListener('click', disableDebugMode);
    const debugConfirm = $('debug-confirm');
    const debugCancel = $('debug-cancel');
    const debugChangePassword = $('debug-change-password');
    const debugPasswordCancel = $('debug-password-cancel');
    const debugPasswordSave = $('debug-password-save');
    if (debugConfirm) debugConfirm.addEventListener('click', confirmDebugPassword);
    if ($('debug-password')) {
      $('debug-password').addEventListener('keydown', event => {
        if (event.key === 'Enter') confirmDebugPassword();
      });
    }
    if (debugCancel) debugCancel.addEventListener('click', closeDebugDialog);
    if (debugChangePassword) debugChangePassword.addEventListener('click', openDebugPasswordDialog);
    if (debugPasswordCancel) debugPasswordCancel.addEventListener('click', closeDebugPasswordDialog);
    if (debugPasswordSave) debugPasswordSave.addEventListener('click', changeDebugPassword);
    const debugNewPassword = $('debug-new-password');
    if (debugNewPassword) {
      debugNewPassword.addEventListener('input', () => updatePasswordRuleList('desktop-debug-password-rules', debugNewPassword.value));
      updatePasswordRuleList('desktop-debug-password-rules', debugNewPassword.value);
    }
    if (messageClose) messageClose.addEventListener('click', closeMessage);
    bindSettingsDrawer([settingsOpen, settingsOpenCompact], settingsClose, settingsBackdrop);
    initDebugPanelDrag();
    if (window.matchMedia) window.matchMedia('(max-width: 980px)').addEventListener('change', updateDebugUi);
    initMobileControlMenu();
    const eventList = $('event-list');
    if (eventList) {
      eventList.addEventListener('click', event => {
        const card = event.target.closest('.event-card, .event');
        if (!card) return;
        state.selectedEventKey = card.dataset.eventKey || '';
        openMobileMap();
        renderLatestEvent();
        renderEventList();
        updateSelectedMap();
      });
    }
    if (tokenInput) tokenInput.value = state.mapToken;
    if (saveToken && tokenInput) {
      saveToken.addEventListener('click', () => {
        state.mapToken = tokenInput.value.trim();
        if (state.mapToken) secureSet('tiandituToken', state.mapToken);
        else secureRemove('tiandituToken');
        renderMapSourceButtons();
        renderOfficialMapLayer();
      });
    }
    updateTokenVisibility();
    setText('country-status', `${localizedCountryName(state.geoCountryCode)}${state.geoRegionName ? ` · ${standardizePlaceName(state.geoRegionName)}` : ''}`);
    setText('user-location', '定位已设置');
  }

  function openMobileMap() {
    if (!window.matchMedia('(max-width: 980px)').matches) return;
    document.body.classList.add('mobile-map-open');
    setTimeout(() => {
      if (state.map) {
        state.map.invalidateSize();
        updateSelectedMap();
      }
    }, 80);
  }

  function bindSettingsDrawer(openButton, closeButton, backdrop) {
    const drawer = $('control-panel');
    const openButtons = Array.isArray(openButton) ? openButton.filter(Boolean) : [openButton].filter(Boolean);
    if (!drawer || !openButtons.length || !closeButton || !backdrop) return;
    const setOpen = open => {
      document.body.classList.toggle('desktop-settings-open', open);
      drawer.setAttribute('aria-hidden', String(!open));
    };
    openButtons.forEach(button => button.addEventListener('click', () => setOpen(true)));
    closeButton.addEventListener('click', () => setOpen(false));
    backdrop.addEventListener('click', () => setOpen(false));
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') setOpen(false);
    });
  }

  function closeSettingsDrawer() {
    const drawer = $('control-panel');
    document.body.classList.remove('desktop-settings-open');
    if (drawer) drawer.setAttribute('aria-hidden', 'true');
  }

  function closeMobileMap() {
    document.body.classList.remove('mobile-map-open');
  }

  function initMobileControlMenu() {
    const button = $('mobile-control-toggle');
    const backdrop = $('mobile-control-backdrop');
    if (!button || !backdrop) return;
    const setOpen = open => {
      document.body.classList.toggle('mobile-control-open', open);
      button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('click', () => setOpen(!document.body.classList.contains('mobile-control-open')));
    backdrop.addEventListener('click', () => setOpen(false));
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') setOpen(false);
    });
  }

  function localizedCountryName(countryCode) {
    if (!countryCode) return '未知';
    const key = countryCode === 'CN' ? 'CN_MAINLAND' : countryCode;
    const area = AREA_OPTIONS.find(item => item.key === key);
    return area ? area.label : countryCode;
  }

  function eventIntensity(event) {
    return localIntensity(event);
  }

  function epicenterIntensity(event) {
    return estimateEpicenterIntensity(event);
  }

  function localIntensity(event) {
    return estimateLocalIntensity(event, hasUserLocation() ? state.userLocation : null);
  }

  function hasUserLocation() {
    return isUsableLocation(state.userLocation.lat, state.userLocation.lon);
  }

  function isUsableLocation(lat, lon) {
    const latitude = Number(lat);
    const longitude = Number(lon);
    return Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180 &&
      !(latitude === 0 && longitude === 0);
  }

  function clampNotificationThreshold(value) {
    const number = Number(value);
    return [3, 4, 5, 6].includes(number) ? number : 3;
  }

  function sortedAreaOptions() {
    const priority = ['GLOBAL', 'CN_MAINLAND'];
    const first = priority.map(key => AREA_OPTIONS.find(area => area.key === key)).filter(Boolean);
    const rest = AREA_OPTIONS
      .filter(area => !priority.includes(area.key))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-u-co-pinyin'));
    return first.concat(rest);
  }

  function updateRegionOptions() {
    const regionSelect = $('region-select');
    if (!regionSelect) return;
    const area = AREA_OPTIONS.find(item => item.key === state.countryKey) || AREA_OPTIONS[0];
    const regions = (area.regions || []).slice().sort((a, b) => {
      if (a.key === 'all') return -1;
      if (b.key === 'all') return 1;
      return a.label.localeCompare(b.label, 'zh-Hans-u-co-pinyin');
    });
    regionSelect.innerHTML = regions.map(region => `<option value="${region.key}">${region.label}</option>`).join('');
    regionSelect.value = regions.some(region => region.key === state.regionKey) ? state.regionKey : 'all';
    state.regionKey = regionSelect.value;
  }

  function updateTokenVisibility() {
    const row = $('map-token-row');
    const visible = state.mapSourceKey === 'tianditu';
    if (row) {
      row.classList.toggle('is-hidden', !visible);
      row.setAttribute('aria-hidden', String(!visible));
    }
    const stage = $('map-stage');
    if (stage) stage.classList.toggle('has-map-token-entry', visible);
  }

  function activateMapSource(key) {
    const availability = mapSourceAvailability(key);
    if (availability.externalOnly) {
      openExternalMapSource(key);
      return false;
    }
    state.mapSourceKey = key;
    secureSet('quakeMapSource', state.mapSourceKey);
    updateTokenVisibility();
    renderMapSourceButtons();
    renderOfficialMapLayer();
    if (key === 'tianditu') {
      window.requestAnimationFrame(() => $('map-token')?.focus());
    }
    return true;
  }

  function openExternalMapSource(key) {
    const view = selectedMapView();
    const url = window.OfficialMap && window.OfficialMap.externalUrl
      ? window.OfficialMap.externalUrl(key, view)
      : '';
    if (!url) {
      showMessage('Google Maps', '暂时无法生成 Google Maps 地址。');
      return;
    }
    const opened = window.open(url, '_blank');
    if (opened) opened.opener = null;
    else showMessage('Google Maps', '浏览器阻止了新窗口，请允许本站打开弹出窗口后重试。');
  }

  function renderMapSourceButtons() {
    const buttons = $('desktop-map-source-buttons');
    if (!buttons) return;
    buttons.innerHTML = MAP_SOURCES.map(source => {
      const availability = mapSourceAvailability(source.key);
      const disabled = mapSourceDisabled(source.key);
      const title = disabled || availability.externalOnly ? availability.reason : `切换到${source.label}`;
      return `
      <button type="button" data-map-source="${escapeAttr(source.key)}" class="${source.key === state.mapSourceKey ? 'active' : ''}" aria-label="${escapeAttr(title)}" title="${escapeAttr(title)}"${disabled ? ' disabled aria-disabled="true"' : ''}>
        ${escapeHtml(source.label)}
      </button>
    `;
    }).join('');
  }

  function mapSourceAvailability(key) {
    if (!window.OfficialMap || typeof window.OfficialMap.availability !== 'function') {
      return { available: key === 'auto', reason: '地图适配器未加载' };
    }
    return window.OfficialMap.availability(key, {
      config: state.mapConfig,
      token: state.mapToken,
      countryCode: initialMapCountryCode()
    });
  }

  function mapSourceDisabled(key) {
    if (key === 'auto' || key === 'tianditu') return false;
    return !mapSourceAvailability(key).available;
  }

  function fallbackFromYandexQuota() {
    state.mapConfig.yandexQuotaUsed = Number(state.mapConfig.yandexDailyLimit) || 100;
    state.mapConfig.yandexQuotaRemaining = 0;
    state.mapConfig.yandexQuotaExhausted = true;
    state.mapConfig.yandexMapsAvailable = false;
    state.mapSourceKey = 'google';
    state.pendingMapNotice = 'Yandex 今日 100 次额度已用完，已自动切换到 Google 地图';
    updateTokenVisibility();
    renderMapSourceButtons();
    renderOfficialMapLayer();
  }

  function flushPendingMapNotice() {
    if (!state.pendingMapNotice) return;
    showMapSourceNotice(state.pendingMapNotice);
    state.pendingMapNotice = '';
  }

  function showMapSourceNotice(message) {
    const slot = $('desktop-map-notice-slot');
    if (!slot) return;
    slot.querySelector('.map-source-notice')?.remove();
    const notice = document.createElement('div');
    notice.className = 'map-source-notice';
    notice.dataset.i18nSkip = 'true';
    notice.setAttribute('role', 'status');
    notice.textContent = message;
    slot.appendChild(notice);
    window.setTimeout(() => notice.classList.add('leaving'), 2700);
    window.setTimeout(() => notice.remove(), 3000);
  }

  function initVoiceControls(toggle) {
    const voice = window.QuakeVoice;
    const available = Boolean(voice && voice.supported());
    if (toggle) {
      toggle.disabled = !available;
      toggle.checked = available && voice.isEnabled();
      toggle.addEventListener('change', () => {
        toggle.checked = voice.setEnabled(toggle.checked, { confirm: toggle.checked });
        updateVoiceStatus(toggle.checked, available);
      });
    }
    updateVoiceStatus(Boolean(toggle && toggle.checked), available);
  }

  function updateVoiceStatus(active, available) {
    setText('voice-status', !available
      ? '当前浏览器不支持语音播报'
      : active
        ? '地震语音播报已开启'
        : '语音播报未开启');
  }

  function initNotificationControls(toggle) {
    fillNotificationAreaControls();
    updateNotificationStatus();
    updateNotificationSettingsVisibility();
    watchNotificationPermission();
    bindPushSubscriptionRefresh();
    if (!toggle) return;
    toggle.checked = false;
    const canRestore = isHttpsPushContext() && pushApisSupported() && notificationPermission() === 'granted';
    if (state.desktopNotificationsEnabled && canRestore) {
      setNotificationState(true);
      syncPushSubscription(false).then(ready => {
        if (ready) updateNotificationStatus();
        else updateNotificationStatus('后台推送连接待恢复，将在网络恢复后自动重试');
      });
    } else if (state.desktopNotificationsEnabled) {
      setNotificationState(false);
    }
    toggle.addEventListener('change', async () => {
      if (toggle.checked) await enableDesktopNotifications();
      else await disableDesktopNotifications();
    });
  }

  function bindPushSubscriptionRefresh() {
    if (bindPushSubscriptionRefresh.bound) return;
    bindPushSubscriptionRefresh.bound = true;
    const refresh = () => {
      if (!state.desktopNotificationsEnabled || notificationPermission() !== 'granted' || !navigator.onLine) return;
      syncPushSubscription(false).then(ready => {
        if (ready) setNotificationState(true);
        else updateNotificationStatus('后台推送连接待恢复，将在网络恢复后自动重试');
      });
    };
    window.addEventListener('online', refresh);
    window.setInterval(refresh, 15 * 60 * 1000);
  }

  function setNotificationState(enabled) {
    const active = Boolean(enabled);
    state.desktopNotificationsEnabled = active;
    state.webPushEnabled = active;
    requiredSet('quakeDesktopNotifications', String(active));
    const toggle = $('notification-toggle');
    if (toggle) toggle.checked = active;
    updateNotificationStatus();
    updateNotificationSettingsVisibility();
  }

  function pushApisSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  }

  function watchNotificationPermission() {
    if (!navigator.permissions || !navigator.permissions.query || watchNotificationPermission.bound) return;
    watchNotificationPermission.bound = true;
    navigator.permissions.query({ name: 'notifications' }).then(status => {
      status.onchange = () => {
        if (notificationPermission() === 'denied') {
          setNotificationState(false);
          return;
        }
        updateNotificationStatus();
        updateNotificationSettingsVisibility();
      };
    }).catch(() => {});
  }

  function fillNotificationAreaControls() {
    const country = $('notify-country');
    const region = $('notify-region');
    const province = $('notify-province');
    const city = $('notify-city');
    const district = $('notify-district');
    if (!country || !region || !province || !city || !district) return;
    country.innerHTML = sortedAreaOptions()
      .map(area => `<option value="${escapeAttr(area.key)}">${area.flag ? `${area.flag} ` : ''}${escapeHtml(area.label)}</option>`)
      .join('');
    country.value = optionValue(country, state.notificationArea.country);
    country.addEventListener('change', () => {
      state.notificationArea = { ...state.notificationArea, country: country.value, region: 'all', province: 'all', city: 'all', district: 'all' };
      updateNotificationRegionOptions();
      saveNotificationArea();
    });
    region.addEventListener('change', () => {
      state.notificationArea.region = region.value;
      saveNotificationArea();
    });
    province.innerHTML = [{ code: 'all', name: '全国' }].concat(chinaAdmin)
      .map(item => `<option value="${escapeAttr(item.code)}">${escapeHtml(item.name)}</option>`)
      .join('');
    province.value = optionValue(province, state.notificationArea.province);
    province.addEventListener('change', () => {
      state.notificationArea = { ...state.notificationArea, province: province.value, city: 'all', district: 'all' };
      updateNotificationCityOptions();
      saveNotificationArea();
    });
    city.addEventListener('change', () => {
      state.notificationArea.city = city.value;
      state.notificationArea.district = 'all';
      updateNotificationDistrictOptions();
      saveNotificationArea();
    });
    district.addEventListener('change', () => {
      state.notificationArea.district = district.value;
      saveNotificationArea();
    });
    updateNotificationRegionOptions();
  }

  function syncNotificationSelectValues() {
    const country = $('notify-country');
    const region = $('notify-region');
    const province = $('notify-province');
    const city = $('notify-city');
    const district = $('notify-district');
    if (country) country.value = optionValue(country, state.notificationArea.country);
    if (region) region.value = optionValue(region, state.notificationArea.region);
    if (province) province.value = optionValue(province, state.notificationArea.province);
    if (city) city.value = optionValue(city, state.notificationArea.city);
    if (district) district.value = optionValue(district, state.notificationArea.district);
  }

  function updateNotificationRegionOptions() {
    const region = $('notify-region');
    if (!region) return;
    const area = selectedNotifyCountry();
    region.innerHTML = (area && area.regions || [{ key: 'all', label: '全部' }])
      .map(item => `<option value="${escapeAttr(item.key)}">${escapeHtml(item.label)}</option>`)
      .join('');
    region.value = optionValue(region, state.notificationArea.region);
    const china = state.notificationArea.country === 'CN_MAINLAND';
    const regionRow = controlRow(region);
    if (regionRow) regionRow.classList.toggle('is-hidden', !area || (area.regions || []).length <= 1);
    if (!china) {
      state.notificationArea.province = 'all';
      state.notificationArea.city = 'all';
      state.notificationArea.district = 'all';
    }
    updateNotificationCityOptions();
  }

  function updateNotificationCityOptions() {
    const provinceSelect = $('notify-province');
    const provinceRow = controlRow(provinceSelect);
    const city = $('notify-city');
    if (!city) return;
    const china = state.notificationArea.country === 'CN_MAINLAND';
    if (provinceRow) provinceRow.classList.toggle('is-hidden', !china);
    const province = selectedNotifyProvince();
    if (!province) {
      state.notificationArea.city = 'all';
      state.notificationArea.district = 'all';
    }
    city.innerHTML = [{ code: 'all', name: '全部城市' }].concat(province ? province.cities || [] : [])
      .map(item => `<option value="${escapeAttr(item.code)}">${escapeHtml(item.name)}</option>`)
      .join('');
    city.value = optionValue(city, state.notificationArea.city);
    const cityRow = controlRow(city);
    if (cityRow) cityRow.classList.toggle('is-hidden', !china || !province);
    updateNotificationDistrictOptions();
  }

  function updateNotificationDistrictOptions() {
    const district = $('notify-district');
    if (!district) return;
    const city = selectedNotifyCity();
    if (!city) state.notificationArea.district = 'all';
    district.innerHTML = [{ code: 'all', name: '全部区县' }].concat(city ? city.districts || [] : [])
      .map(item => `<option value="${escapeAttr(item.code)}">${escapeHtml(item.name)}</option>`)
      .join('');
    district.value = optionValue(district, state.notificationArea.district);
    const districtRow = controlRow(district);
    if (districtRow) districtRow.classList.toggle('is-hidden', !city);
  }

  function optionValue(select, value) {
    if (Array.from(select.options).some(option => option.value === value)) return value;
    if (Array.from(select.options).some(option => option.value === 'all')) return 'all';
    return select.options[0] ? select.options[0].value : 'all';
  }

  function controlRow(element) {
    return element && (element.closest('.token-line') || element.closest('.setting-field') || element.parentElement);
  }

  function selectedNotifyProvince() {
    return chinaAdmin.find(item => item.code === state.notificationArea.province) || null;
  }

  function selectedNotifyCountry() {
    return AREA_OPTIONS.find(item => item.key === state.notificationArea.country) || AREA_OPTIONS.find(item => item.key === 'CN_MAINLAND');
  }

  function selectedNotifyCity() {
    const province = selectedNotifyProvince();
    return province && (province.cities || []).find(item => item.code === state.notificationArea.city) || null;
  }

  function selectedNotifyDistrict() {
    const city = selectedNotifyCity();
    return city && (city.districts || []).find(item => item.code === state.notificationArea.district) || null;
  }

  function saveNotificationArea() {
    state.notificationArea = notificationAreaPayload();
    requiredSet('quakeNotificationArea', JSON.stringify(state.notificationArea));
    syncNotificationSelectValues();
    if (state.webPushEnabled) {
      syncPushSubscription(false).then(ready => {
        if (ready) updateNotificationStatus();
        else updateNotificationStatus('推送条件待同步，将在网络恢复后自动重试');
      });
    }
  }

  function notificationAreaPayload() {
    const country = selectedNotifyCountry();
    const region = country && (country.regions || []).find(item => item.key === state.notificationArea.region);
    const province = selectedNotifyProvince();
    const city = selectedNotifyCity();
    const district = selectedNotifyDistrict();
    return {
      country: country ? country.key : 'CN_MAINLAND',
      countryName: country ? country.label : '中华人民共和国',
      region: region ? region.key : 'all',
      regionName: region && region.key !== 'all' ? region.label : '',
      province: state.notificationArea.province || 'all',
      provinceName: province ? province.name : '',
      city: state.notificationArea.city || 'all',
      cityName: city ? city.name : '',
      district: state.notificationArea.district || 'all',
      districtName: district ? district.name : ''
    };
  }

  async function enableDesktopNotifications() {
    if (!isHttpsPushContext()) {
      setNotificationState(false);
      showMessage('后台推送', '后台推送仅在 HTTPS 页面可用，请通过 HTTPS 地址重新打开本站。');
      return;
    }
    if (!pushApisSupported()) {
      setNotificationState(false);
      showMessage('后台推送', '当前浏览器不支持 Service Worker 或 Push API，无法启用后台推送。');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch (_error) {
        permission = 'denied';
      }
    }
    if (permission !== 'granted') {
      setNotificationState(false);
      showMessage('后台推送', '浏览器没有授予通知权限。请在地址栏左侧的网站权限中允许“通知”，然后重新开启后台推送。');
      return;
    }
    const pushReady = await syncPushSubscription(true);
    setNotificationState(pushReady);
  }

  async function disableDesktopNotifications() {
    await unsubscribePushSubscription();
    setNotificationState(false);
  }

  function notificationPermission() {
    return 'Notification' in window ? Notification.permission : 'unsupported';
  }

  function isHttpsPushContext() {
    return window.location.protocol === 'https:' && window.isSecureContext === true;
  }

  function updateNotificationStatus(text) {
    const status = $('notification-status');
    if (!status) return;
    if (text) {
      status.textContent = text;
      return;
    }
    const permission = notificationPermission();
    if (!isHttpsPushContext()) status.textContent = '后台推送仅支持 HTTPS';
    else if (!pushApisSupported() || permission === 'unsupported') status.textContent = '当前浏览器不支持后台推送';
    else if (permission === 'granted' && state.webPushEnabled) status.textContent = '后台系统推送已开启';
    else if (permission === 'denied') status.textContent = '通知权限已被浏览器阻止';
    else status.textContent = '后台推送未开启';
  }

  function updateNotificationSettingsVisibility() {
    const panel = $('notification-settings-panel');
    if (!panel) return;
    panel.classList.toggle('is-hidden', !state.webPushEnabled);
  }

  async function syncPushSubscription(showMessageOnFail) {
    try {
      if (!window.QuakePush) throw new Error('浏览器推送组件未加载，请强制刷新页面后重试。');
      await window.QuakePush.ensureSubscription(pushSubscriptionOptions());
      return true;
    } catch (error) {
      if (showMessageOnFail) showMessage('后台推送', pushSetupErrorMessage(error));
      return false;
    }
  }

  function pushSubscriptionOptions() {
    return {
      threshold: state.notificationThreshold,
      area: notificationAreaPayload(),
      userLocation: state.userLocation,
      clientPath: '/'
    };
  }

  function pushSetupErrorMessage(error) {
    if (window.QuakePush) return window.QuakePush.errorMessage(error);
    if (error && error.message) return error.message;
    return '后台推送订阅失败，请检查 HTTPS 证书、浏览器通知权限和服务器 VAPID 配置。';
  }

  async function unsubscribePushSubscription() {
    try {
      if (window.QuakePush) await window.QuakePush.unsubscribe(pushSubscriptionOptions());
    } catch (_error) {
      // 用户关闭推送时静默兜底，状态仍按关闭处理。
    }
  }

  async function sendPushEventToCurrentDevice(event) {
    if (!event) throw new Error('当前没有可发送的地震信息。');
    if (!window.QuakePush) throw new Error('浏览器推送组件未加载，请强制刷新页面后重试。');
    const result = await window.QuakePush.sendEvent(event, pushSubscriptionOptions());
    setNotificationState(true);
    return result;
  }

  async function testDesktopNotification() {
    if (!debugEnabled) return;
    const event = selectedLatestEvent();
    if (!event) {
      showMessage('本机通知测试', '当前没有可发送的地震信息。');
      return;
    }
    try {
      const result = await sendPushEventToCurrentDevice(event);
      showMessage('本机通知测试', window.QuakePush.deliveryMessage(result));
    } catch (error) {
      showMessage('本机通知测试', pushSetupErrorMessage(error));
    }
  }

  async function testDesktopBackgroundPush() {
    if (!debugEnabled) return;
    try {
      const result = await sendPushEventToCurrentDevice(testNotificationEvent());
      showMessage('后台推送测试', window.QuakePush.deliveryMessage(result));
    } catch (error) {
      showMessage('后台推送测试', pushSetupErrorMessage(error));
    }
  }

  function sendAreaFilter() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({
      type: 'area_filter',
      country: state.countryKey,
      region: state.regionKey,
      userLocation: state.userLocation
    }));
  }

  function applyAreaChange() {
    state.events = [];
    state.areaEvents = [];
    state.selectedEventKey = '';
    state.historyError = '';
    setDataStatus('connecting');
    closeMobileMap();
    clearMapEpicenter();
    fitSelectedArea();
    renderLatestEvent();
    renderEventList();
    sendAreaFilter();
    loadAreaHistory();
  }

  function fitSelectedArea() {
    if (!state.map) return;
    const area = AREA_OPTIONS.find(item => item.key === state.countryKey);
    if (!area || !area.bbox) return;
    const [minLon, minLat, maxLon, maxLat] = area.bbox;
    state.map.fitBounds([[minLat, minLon], [maxLat, maxLon]], { padding: [28, 28], animate: true });
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    const datasetTheme = theme === 'dark' ? 'dark' : 'light';
    if (root.dataset.theme !== datasetTheme) {
      root.classList.add('theme-transitioning');
      clearTimeout(themeTransitionTimer);
      themeTransitionTimer = setTimeout(() => root.classList.remove('theme-transitioning'), THEME_TRANSITION_MS);
    }
    root.dataset.theme = datasetTheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', datasetTheme === 'light' ? '#f4f7fb' : '#07111f');
    const themeSwitch = $('theme-switch');
    if (themeSwitch) themeSwitch.checked = datasetTheme === 'dark';
  }

  function initAutoTheme() {
    if (initAutoTheme.bound) return;
    initAutoTheme.bound = true;
    const refresh = () => {
      if (state.themeMode !== 'system') return;
      const nextTheme = resolveThemeMode('system');
      if (nextTheme === state.theme) return;
      state.theme = nextTheme;
      applyTheme(nextTheme);
    };
    if (window.matchMedia) {
      ['(prefers-color-scheme: dark)', '(prefers-color-scheme: light)'].forEach(query => {
        const media = window.matchMedia(query);
        if (media.addEventListener) media.addEventListener('change', refresh);
        else if (media.addListener) media.addListener(refresh);
      });
    }
    window.setInterval(refresh, 60000);
  }

  function openDebugDialog() {
    const dialog = $('debug-dialog');
    if (!dialog) return;
    const input = $('debug-password');
    if (input) input.value = '';
    dialog.classList.add('show');
    setTimeout(() => input && input.focus(), 30);
  }

  function closeDebugDialog() {
    const dialog = $('debug-dialog');
    if (dialog) dialog.classList.remove('show');
  }

  function openDebugPasswordDialog() {
    closeDebugDialog();
    const dialog = $('debug-password-dialog');
    if (!dialog) return;
    if ($('debug-old-password')) $('debug-old-password').value = '';
    if ($('debug-new-password')) $('debug-new-password').value = '';
    dialog.classList.add('show');
    setTimeout(() => $('debug-old-password') && $('debug-old-password').focus(), 30);
  }

  function closeDebugPasswordDialog() {
    const dialog = $('debug-password-dialog');
    if (dialog) dialog.classList.remove('show');
    openDebugDialog();
  }

  async function confirmDebugPassword() {
    const input = $('debug-password');
    const password = input ? input.value : '';
    if (!password) return;
    try {
      const response = await fetch('/debug/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = response.ok ? await response.json() : {};
      if (!data.ok) {
        showMessage('调试模式', '密码错误，请重新输入。');
        return;
      }
      debugEnabled = true;
      closeDebugDialog();
      closeSettingsDrawer();
      updateDebugUi();
      setText('debug-float-status', '已开启');
    } catch (_error) {
      showMessage('调试模式', '暂时无法开启调试模式，请稍后再试。');
    }
  }

  async function changeDebugPassword() {
    const oldPassword = $('debug-old-password') ? $('debug-old-password').value : '';
    const newPassword = $('debug-new-password') ? $('debug-new-password').value : '';
    if (!oldPassword || !newPassword) {
      showMessage('修改密码', '请填写原密码和新密码。');
      return;
    }
    const policyMessage = debugPasswordPolicyMessage(newPassword);
    if (policyMessage) {
      showMessage('修改密码', policyMessage);
      return;
    }
    try {
      const response = await fetch('/debug/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!data.ok) {
        showMessage('修改密码', data.message || '原密码不正确，请重新输入。');
        return;
      }
      if ($('debug-old-password')) $('debug-old-password').value = '';
      if ($('debug-new-password')) $('debug-new-password').value = '';
      const dialog = $('debug-password-dialog');
      if (dialog) dialog.classList.remove('show');
      showMessage('修改密码', '调试密码已更新。');
    } catch (_error) {
      showMessage('修改密码', '暂时无法修改调试密码，请稍后再试。');
    }
  }

  function debugPasswordChecks(password) {
    const value = String(password || '');
    return {
      length: value.length >= 8 && value.length <= 128,
      uppercase: /[A-Z]/.test(value),
      number: /[0-9]/.test(value),
      special: /[^A-Za-z0-9\s]/.test(value)
    };
  }

  function debugPasswordPolicyMessage(password) {
    const checks = debugPasswordChecks(password);
    const english = Boolean(window.QuakeI18n && window.QuakeI18n.isEnglish);
    if (!checks.length) return english
      ? 'The new password must contain 8 to 128 characters.'
      : '新密码需要 8 至 128 位。';
    const labels = english
      ? { uppercase: '1 uppercase letter', number: '1 number', special: '1 special character such as @' }
      : { uppercase: '至少 1 个大写字母', number: '至少 1 个数字', special: '至少 1 个特殊符号（例如 @）' };
    const missing = ['uppercase', 'number', 'special'].filter(key => !checks[key]).map(key => labels[key]);
    if (!missing.length) return '';
    return english
      ? `The new password still needs ${missing.join(', ')}.`
      : `新密码还需要：${missing.join('、')}。`;
  }

  function updatePasswordRuleList(id, password) {
    const list = document.getElementById(id);
    if (!list) return;
    const checks = debugPasswordChecks(password);
    const hasValue = String(password || '').length > 0;
    list.querySelectorAll('[data-password-rule]').forEach(item => {
      const valid = Boolean(checks[item.dataset.passwordRule]);
      item.classList.toggle('is-valid', valid);
      item.classList.toggle('is-invalid', hasValue && !valid);
    });
  }

  function updateDebugUi() {
    const row = document.querySelector('.debug-row');
    const status = $('debug-status');
    const panel = $('debug-floating-panel');
    if (row) {
      row.classList.toggle('is-hidden', debugEnabled);
      row.classList.toggle('debug-active', debugEnabled);
    }
    if (status) {
      status.classList.toggle('is-hidden', debugEnabled);
      status.textContent = debugEnabled ? '调试模式开启' : '调试模式关闭';
    }
    if ($('debug-enable')) $('debug-enable').textContent = debugEnabled ? '打开调试工具' : '调试模式';
    if (panel) {
      panel.classList.toggle('is-hidden', !debugEnabled);
      panel.setAttribute('aria-hidden', debugEnabled ? 'false' : 'true');
      if (debugEnabled) {
        const reset = !panel.dataset.positioned;
        positionDebugPanelInViewport(panel, reset);
      }
    }
    setText('debug-float-status', debugEnabled ? '已开启' : '已关闭');
  }

  function showDebugPanel() {
    closeSettingsDrawer();
    updateDebugUi();
    const panel = $('debug-floating-panel');
    if (!panel) return;
    window.requestAnimationFrame(() => {
      positionDebugPanelInViewport(panel, false);
      panel.focus({ preventScroll: true });
    });
  }

  function debugViewportBounds() {
    const viewport = window.visualViewport;
    const edge = window.matchMedia && window.matchMedia('(max-width: 720px), (max-height: 560px)').matches ? 12 : 20;
    const left = viewport ? viewport.offsetLeft : 0;
    const top = viewport ? viewport.offsetTop : 0;
    const width = viewport ? viewport.width : window.innerWidth;
    const height = viewport ? viewport.height : window.innerHeight;
    return { edge, left, top, width, height };
  }

  function positionDebugPanelInViewport(panel, reset) {
    if (!panel || panel.classList.contains('is-hidden')) return;
    const viewport = debugViewportBounds();
    if (reset) {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = `${viewport.edge}px`;
      panel.style.bottom = `${viewport.edge}px`;
      panel.style.width = '';
      panel.dataset.positioned = 'true';
    }
    const rect = panel.getBoundingClientRect();
    const maxWidth = Math.max(120, viewport.width - viewport.edge * 2);
    if (rect.width > maxWidth) panel.style.width = `${Math.floor(maxWidth)}px`;
    const nextRect = panel.getBoundingClientRect();
    const minLeft = viewport.left + viewport.edge;
    const minTop = viewport.top + viewport.edge;
    const maxLeft = Math.max(minLeft, viewport.left + viewport.width - nextRect.width - viewport.edge);
    const maxTop = Math.max(minTop, viewport.top + viewport.height - nextRect.height - viewport.edge);
    panel.style.left = `${Math.min(maxLeft, Math.max(minLeft, nextRect.left))}px`;
    panel.style.top = `${Math.min(maxTop, Math.max(minTop, nextRect.top))}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function disableDebugMode() {
    debugEnabled = false;
    updateDebugUi();
  }

  function initDebugPanelDrag() {
    const panel = $('debug-floating-panel');
    const handle = $('debug-panel-handle');
    if (!panel || !handle) return;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      debugPanelDrag = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      panel.classList.add('is-dragging');
      panel.style.width = `${Math.round(rect.width)}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      event.preventDefault();
    });
    document.addEventListener('pointermove', event => {
      if (!debugPanelDrag) return;
      const viewport = debugViewportBounds();
      const minLeft = viewport.left + viewport.edge;
      const minTop = viewport.top + viewport.edge;
      const maxLeft = Math.max(minLeft, viewport.left + viewport.width - panel.offsetWidth - viewport.edge);
      const maxTop = Math.max(minTop, viewport.top + viewport.height - panel.offsetHeight - viewport.edge);
      const left = Math.min(maxLeft, Math.max(minLeft, event.clientX - debugPanelDrag.offsetX));
      const top = Math.min(maxTop, Math.max(minTop, event.clientY - debugPanelDrag.offsetY));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    });
    document.addEventListener('pointerup', () => {
      if (!debugPanelDrag) return;
      debugPanelDrag = null;
      panel.classList.remove('is-dragging');
    });
    const keepVisible = () => {
      if (debugEnabled) positionDebugPanelInViewport(panel, false);
    };
    window.addEventListener('resize', keepVisible, { passive: true });
    window.addEventListener('quake-language-change', keepVisible);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', keepVisible, { passive: true });
      window.visualViewport.addEventListener('scroll', keepVisible, { passive: true });
    }
  }

  function showDebugCookieBar() {
    if (!debugEnabled) {
      openDebugDialog();
      return;
    }
    if (storage && storage.showCookieChoiceBar) {
      storage.showCookieChoiceBar();
      setText('debug-float-status', '已显示 Cookie 提示栏');
    } else {
      showMessage('Cookie 提示', '当前浏览器暂时无法显示 Cookie 提示栏。');
    }
  }

  async function addDebugEarthquakeEvent() {
    if (!debugEnabled) {
      openDebugDialog();
      return;
    }
    const now = new Date();
    const epicenter = debugFaultLocation();
    const magnitude = Number((3.2 + secureRandom() * 3.8).toFixed(1));
    const testEvent = {
      source: 'debug_local',
      sourceLabel: '本地调试',
      eventId: `debug-${now.getTime()}`,
      location: epicenter.location,
      magnitude,
      depth: Math.round(6 + secureRandom() * 18),
      latitude: epicenter.latitude,
      longitude: epicenter.longitude,
      intensity: magnitude >= 5 ? 6 : magnitude >= 4 ? 4 : 3,
      originTime: now.toISOString(),
      receivedAt: now.toISOString(),
      isHistory: false,
      isLive: true,
      debugForceVisible: true
    };
    testEvent.eventKey = getEventKey(testEvent);
    state.selectedEventKey = testEvent.eventKey;
    upsertEvent(testEvent, false, true, true);
    try {
      await sendPushEventToCurrentDevice(testEvent);
      setText('debug-float-status', '测试地震已添加 · 设备推送已发送');
    } catch (error) {
      setText('debug-float-status', '测试地震已添加 · 设备推送失败');
      showMessage('测试地震推送', pushSetupErrorMessage(error));
    }
  }

  function debugFaultLocation() {
    const base = FAULT_BELT_LOCATIONS[Math.floor(secureRandom() * FAULT_BELT_LOCATIONS.length)];
    return {
      location: base.location,
      latitude: base.lat + (secureRandom() - 0.5) * 0.18,
      longitude: base.lon + (secureRandom() - 0.5) * 0.18
    };
  }

  function secureRandom() {
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') return 0.5;
    return window.crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
  }

  function showMessage(title, text) {
    const dialog = $('message-dialog');
    if (!dialog) return;
    setText('message-title', title || '提示');
    setText('message-text', text || '请稍后重试。');
    dialog.classList.add('show');
  }

  function closeMessage() {
    const dialog = $('message-dialog');
    if (dialog) dialog.classList.remove('show');
  }

  async function maybeStartGuide() {
    if (hasLocalCookie()) return;
    if (storage && storage.showCookieChoiceBar) storage.showCookieChoiceBar();
    const begin = () => setTimeout(() => {
      if (!hasLocalCookie() && !document.getElementById('cookie-choice-bar')) startGuide(0);
    }, 220);
    if (document.getElementById('cookie-choice-bar')) {
      window.addEventListener('secure-storage-cookie-choice', begin, { once: true });
    } else {
      begin();
    }
  }

  function guideSteps() {
    const settingsTarget = window.matchMedia('(max-width: 1180px)').matches
      ? '#desktop-settings-open-compact'
      : '#desktop-settings-open';
    return [
      { target: '.map-panel', title: '震中地图', text: '显示震中位置和地震波范围。' },
      { target: '.alert-panel', title: '地震详情', text: '显示震级、预计到达、烈度、发震时间和接收时间。' },
      { target: '.events-panel', title: '历史地震', text: '显示按时间排序的历史和实时事件。' },
      { target: settingsTarget, title: '设置', text: '打开地图源、区域筛选、系统推送和调试设置。' }
    ];
  }

  function startGuide(index) {
    guideIndex = index;
    const steps = guideSteps();
    if (guideIndex >= steps.length) return closeGuide(true);
    const target = document.querySelector(steps[guideIndex].target);
    if (!target) return startGuide(guideIndex + 1);
    guideTarget = target;
    if (!guideOverlay) {
      guideOverlay = document.createElement('section');
      guideOverlay.className = 'guide-overlay';
      guideOverlay.setAttribute('role', 'dialog');
      guideOverlay.setAttribute('aria-modal', 'true');
      guideOverlay.setAttribute('aria-label', '功能导览');
      guideOverlay.innerHTML = '<div class="guide-spot"></div><article class="guide-bubble"></article>';
      document.body.appendChild(guideOverlay);
      window.addEventListener('resize', refreshGuidePlacement, { passive: true });
      if (window.visualViewport) window.visualViewport.addEventListener('resize', refreshGuidePlacement, { passive: true });
    }
    target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
    setTimeout(() => renderGuideStep(target, steps), 180);
  }

  function placeGuideElements(spot, bubble, rect) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spotMargin = 5;
    const pad = 8;
    const spotLeft = Math.max(spotMargin, rect.left - pad);
    const spotTop = Math.max(spotMargin, rect.top - pad);
    const spotRight = Math.min(viewportWidth - spotMargin, rect.right + pad);
    const spotBottom = Math.min(viewportHeight - spotMargin, rect.bottom + pad);
    spot.style.cssText = `left:${spotLeft}px;top:${spotTop}px;width:${Math.max(0, spotRight - spotLeft)}px;height:${Math.max(0, spotBottom - spotTop)}px`;

    const margin = 12;
    const gap = 12;
    bubble.style.visibility = 'hidden';
    bubble.style.right = 'auto';
    bubble.style.left = `${margin}px`;
    bubble.style.top = `${margin}px`;
    const box = bubble.getBoundingClientRect();
    const bubbleWidth = Math.min(box.width, viewportWidth - margin * 2);
    const bubbleHeight = Math.min(box.height, viewportHeight - margin * 2);
    const target = {
      left: Math.max(margin, Math.min(viewportWidth - margin, rect.left)),
      right: Math.max(margin, Math.min(viewportWidth - margin, rect.right)),
      top: Math.max(margin, Math.min(viewportHeight - margin, rect.top)),
      bottom: Math.max(margin, Math.min(viewportHeight - margin, rect.bottom))
    };
    const placements = [
      { side: 'right', space: viewportWidth - margin - target.right, needed: bubbleWidth + gap },
      { side: 'left', space: target.left - margin, needed: bubbleWidth + gap },
      { side: 'bottom', space: viewportHeight - margin - target.bottom, needed: bubbleHeight + gap },
      { side: 'top', space: target.top - margin, needed: bubbleHeight + gap }
    ];
    const placement = placements.find(item => item.space >= item.needed)
      || placements.reduce((best, item) => item.space > best.space ? item : best, placements[0]);
    let left = (viewportWidth - bubbleWidth) / 2;
    let top = (viewportHeight - bubbleHeight) / 2;
    if (placement.side === 'right') {
      left = target.right + gap;
      top = (target.top + target.bottom - bubbleHeight) / 2;
    } else if (placement.side === 'left') {
      left = target.left - bubbleWidth - gap;
      top = (target.top + target.bottom - bubbleHeight) / 2;
    } else if (placement.side === 'bottom') {
      left = (target.left + target.right - bubbleWidth) / 2;
      top = target.bottom + gap;
    } else {
      left = (target.left + target.right - bubbleWidth) / 2;
      top = target.top - bubbleHeight - gap;
    }
    bubble.style.left = `${Math.max(margin, Math.min(viewportWidth - bubbleWidth - margin, left))}px`;
    bubble.style.top = `${Math.max(margin, Math.min(viewportHeight - bubbleHeight - margin, top))}px`;
    bubble.style.visibility = 'visible';
  }

  function refreshGuidePlacement() {
    if (!guideOverlay || !guideTarget || !guideTarget.isConnected) return;
    if (guideResizeFrame) window.cancelAnimationFrame(guideResizeFrame);
    guideResizeFrame = window.requestAnimationFrame(() => {
      guideResizeFrame = 0;
      renderGuideStep(guideTarget, guideSteps());
    });
  }

  function renderGuideStep(target, steps) {
    const step = steps[guideIndex];
    const rect = target.getBoundingClientRect();
    const spot = guideOverlay.querySelector('.guide-spot');
    const bubble = guideOverlay.querySelector('.guide-bubble');
    bubble.innerHTML = `
      <strong>${escapeHtml(step.title)}</strong>
      <p>${escapeHtml(step.text)}</p>
      <div><span>${guideIndex + 1}/${steps.length}</span><button type="button" data-guide="skip">跳过</button><button type="button" data-guide="next">${guideIndex === steps.length - 1 ? '完成' : '下一个'}</button></div>
    `;
    placeGuideElements(spot, bubble, rect);
    bubble.querySelector('[data-guide="skip"]').onclick = () => closeGuide(true);
    bubble.querySelector('[data-guide="next"]').onclick = () => startGuide(guideIndex + 1);
  }

  function closeGuide(done) {
    if (done) {
      writeEssentialCookie(GUIDE_COOKIE, 'true');
      secureSet(GUIDE_KEY, 'true');
    }
    window.removeEventListener('resize', refreshGuidePlacement);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', refreshGuidePlacement);
    if (guideResizeFrame) window.cancelAnimationFrame(guideResizeFrame);
    if (guideOverlay) guideOverlay.remove();
    guideOverlay = null;
    guideTarget = null;
    guideResizeFrame = 0;
  }

  function updateClock() {
    const now = new Date();
    const formatted = formatTime(now);
    const text = window.matchMedia('(max-width: 980px)').matches
      ? formatted.replace(/\s+(?=\d{2}:\d{2})/, '\n')
      : formatted;
    setText('current-time', text);
  }

  function refreshPushWorker() {
    if (window.QuakePush) window.QuakePush.refreshExistingWorker();
  }

  function applyBootstrapEvents() {
    const bootstrap = window.__QUAKE_BOOTSTRAP__;
    const events = bootstrap && Array.isArray(bootstrap.events) ? bootstrap.events : [];
    window.__QUAKE_BOOTSTRAP__ = null;
    if (events.length) setDataStatus('ready');
    events.slice().reverse().forEach(event => upsertEvent({ ...event, isHistory: true, isLive: false }, true, true));
  }

  async function start() {
    refreshPushWorker();
    await loadPrivateSettings();
    if (window.QuakeVoice) await window.QuakeVoice.init();
    applyBootstrapEvents();
    renderLatestEvent();
    renderEventList();
    updateClock();
    renderSourceStatus();
    connect();
    loadSourceSnapshot(true);
    loadAreaHistory();
    await loadConfig();
    initControls();
    initMapMetricLayout();
    window.addEventListener('quake-language-change', renderLatestEvent);
    window.addEventListener('resize', settleAlertPanelFit, { passive: true });
    renderSourceStatus();
    renderLatestEvent();
    updateSelectedMap();
    updateClock();
    initMap().catch(() => {
      showMapRuntimeStatus('地图服务暂时不可用，请稍后重试', '加载失败');
    });
    state.userContextPromise = loadUserContext().catch(() => {});
    primeBrowserLocation().catch(() => {});
    setInterval(updateClock, 1000);
    setInterval(renderLatestEvent, 1000);
    setInterval(refreshSourceHealth, 5000);
    setInterval(loadAreaHistory, 60 * 60 * 1000);
    maybeStartGuide();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
