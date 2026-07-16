(function () {
  const shared = window.EarthquakeShared || {};
  const {
    ALL_SOURCES = [],
    MAP_SOURCES = [],
    AREA_OPTIONS = [],
    standardizePlaceName = value => String(value || ''),
    getEventKey = event => `${event.source || 'source'}:${event.location || 'place'}:${event.magnitude || ''}:${event.originTime || ''}`,
    isRealEarthquake = event => Boolean(event && event.location && Number.isFinite(Number(event.magnitude))),
    matchesArea = () => true,
    estimateWaveCountdowns = () => ({ p: null, s: null, distanceKm: null }),
    estimateEpicenterIntensity = event => event && event.intensity,
    estimateLocalIntensity = () => '',
    intensityColor = value => ({ level: value || '', label: value ? `${value}` : '未知' }),
    formatIntensitySummary = (event, userLocation) => {
      const local = intensityColor(estimateLocalIntensity(event, userLocation));
      const epicenter = intensityColor(estimateEpicenterIntensity(event));
      return {
        local,
        epicenter,
        localValue: local.level ? local.label : '--',
        epicenterValue: epicenter.level ? epicenter.label : '--',
        localShort: local.level ? `本地烈度 ${local.label}` : '本地烈度 --',
        epicenterShort: epicenter.level ? `震中烈度 ${epicenter.label}` : '震中烈度 --'
      };
    },
    magnitudeIntensity = magnitude => ({ label: Number(magnitude) >= 5 ? '高强度' : Number(magnitude) >= 4 ? '中强度' : '低强度' }),
    formatNumber = (value, suffix = '', digits = 1) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)}${suffix}` : '--',
    formatCoordinatePair = () => '--',
    wavePixelSize = () => 128,
    formatTime = value => value || '--',
    formatTimeWithZone = value => value || '--',
    formatCountdown = value => Number.isFinite(Number(value)) && Number(value) > 0 ? `${Math.round(Number(value))} 秒` : '已结束',
    taiwanLocationLayout = () => null,
    liveChannelStatus = (connected, serverState, hasSnapshot, threshold = 4) => {
      if (hasSnapshot && connected >= threshold) return { tone: 'connected', label: '实时通道已连接' };
      if (hasSnapshot && connected > 0) return { tone: 'warning', label: '实时通道正在连接' };
      if (hasSnapshot || serverState === 'disconnected') return { tone: 'offline', label: '实时通道未连接' };
      return { tone: 'warning', label: '正在连接服务器' };
    }
  } = shared;

  const storage = window.SecureStorage;
  const HISTORY_REFRESH_MS = 60 * 60 * 1000;
  const MAX_EVENTS = 30;
  const GUIDE_COOKIE = 'qs_guide_seen';
  const MIN_HEALTHY_SOURCE_COUNT = 4;
  const SOURCE_SNAPSHOT_MAX_AGE_MS = 30000;
  const DEFAULT_LOCATION = { lat: null, lon: null, place: '', adminPlace: '', source: 'unavailable' };
  const DEFAULT_COUNTRY = 'CN_MAINLAND';
  const DEFAULT_REGION = 'all';
  const faultCities = [
    { location: '四川甘孜州康定市', lat: 30.05, lon: 101.96 },
    { location: '云南昭通市鲁甸县', lat: 27.10, lon: 103.30 },
    { location: '青海海北州门源县', lat: 37.77, lon: 101.26 },
    { location: '新疆阿克苏地区乌什县', lat: 41.26, lon: 78.63 },
    { location: '西藏日喀则市定日县', lat: 28.50, lon: 87.45 }
  ];
  const statusLabels = {
    connected: '已连接',
    connecting: '连接中',
    reconnecting: '重连中',
    error: '异常',
    closed: '未启用'
  };

  const state = {
    events: [],
    selectedKey: '',
    sources: new Map(),
    ws: null,
    reconnectDelay: 1000,
    serverConnectionState: 'connecting',
    hasSourceSnapshot: false,
    sourceSnapshotAt: 0,
    historyTimer: null,
    map: null,
    marker: null,
    waveMarker: null,
    userMarker: null,
    mapSourceKey: 'auto',
    activeMapSource: '',
    lastUsableMapSource: '',
    mapToken: '',
    mapConfig: {},
    mapLoadId: 0,
    mapFocusTarget: 'epicenter',
    mapFocusRequestId: 0,
    userContextPromise: null,
    browserLocationPromise: null,
    autoLocationRequested: false,
    themeMode: 'system',
    countryKey: DEFAULT_COUNTRY,
    regionKey: DEFAULT_REGION,
    notificationThreshold: 3,
    mobileNotificationsEnabled: false,
    notificationArea: { country: DEFAULT_COUNTRY, region: DEFAULT_REGION, province: 'all', city: 'all', district: 'all' },
    userLocation: { ...DEFAULT_LOCATION },
    historyError: '',
    dataReady: false,
    pendingMapNotice: '',
    debugEnabled: false
  };

  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const chinaAdmin = Array.isArray(window.CHINA_ADMIN) ? window.CHINA_ADMIN : [];
  const THEME_TRANSITION_MS = 180;
  let guideIndex = 0;
  let guideOverlay = null;
  let guideTarget = null;
  let guideResizeFrame = 0;
  let themeTransitionTimer = null;

  function text(id, value) {
    const node = $(id);
    if (node) node.textContent = value == null || value === '' ? '--' : String(value);
  }

  let mobileLocationFitFrame = 0;

  function renderMobileEventLocation(event, value) {
    const node = $('selected-location');
    if (!node) return;
    const location = String(value || '--');
    const layout = taiwanLocationLayout(location, event);
    node.classList.toggle('is-taiwan-location', Boolean(layout));
    node.style.fontSize = '';
    if (!layout) {
      node.textContent = location;
      node.setAttribute('aria-label', location);
      return;
    }

    const english = Boolean(window.QuakeI18n && window.QuakeI18n.isEnglish);
    const translatedLocation = english && window.QuakeI18n ? window.QuakeI18n.t(location) : location;
    const englishParts = String(translatedLocation).match(/^(.*?)\s*(\([^()]+\))$/);
    const lines = english
      ? englishParts ? [englishParts[1].trim(), englishParts[2]] : [translatedLocation]
      : layout.lines;
    node.replaceChildren(...lines.filter(Boolean).map(line => {
      const span = document.createElement('span');
      span.className = 'mobile-location-line';
      span.textContent = line;
      return span;
    }));
    node.setAttribute('aria-label', translatedLocation);
    if (mobileLocationFitFrame) window.cancelAnimationFrame(mobileLocationFitFrame);
    mobileLocationFitFrame = window.requestAnimationFrame(() => {
      mobileLocationFitFrame = 0;
      node.style.fontSize = '';
      const availableWidth = node.clientWidth;
      const baseSize = Number.parseFloat(window.getComputedStyle(node).fontSize) || 24;
      const widestLine = Array.from(node.querySelectorAll('.mobile-location-line'))
        .reduce((width, line) => Math.max(width, line.scrollWidth), 0);
      if (availableWidth && widestLine > availableWidth) {
        node.style.fontSize = `${Math.max(18, Math.floor(baseSize * availableWidth / widestLine))}px`;
      }
    });
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

  async function getItem(key, fallback = '') {
    try {
      const value = storage ? await storage.getItem(key) : null;
      return value == null ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  async function getJson(key, fallback) {
    try {
      const parsed = JSON.parse(await getItem(key, JSON.stringify(fallback)));
      if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function setItem(key, value) {
    if (storage) storage.setItem(key, String(value)).catch(() => {});
  }

  function setJson(key, value) {
    setItem(key, JSON.stringify(value));
  }

  async function getRequiredItem(key, fallback = '') {
    try {
      const reader = storage && (storage.getRequiredItem || storage.getItem);
      const value = reader ? await reader(key) : null;
      return value == null ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function setRequiredItem(key, value) {
    const writer = storage && (storage.setRequiredItem || storage.setItem);
    if (writer) writer(key, String(value)).catch(() => {});
  }

  async function init() {
    refreshPushWorker();
    if (storage && storage.ready) await storage.ready;
    await loadSettings();
    if (window.QuakeVoice) await window.QuakeVoice.init();
    await loadMapConfig();
    applyTheme();
    bindControls();
    renderMapSourceControls();
    applyBootstrapEvents();
    renderAll();
    if (hasUserLocation()) updateUserLocationMarker();
    else state.userContextPromise = useIpLocationFallback().catch(() => {});
    primeBrowserLocation();
    refreshHistory();
    refreshSourceStatus();
    connect();
    initMap().catch(() => showToast('地图服务暂时不可用'));
    state.historyTimer = window.setInterval(refreshHistory, HISTORY_REFRESH_MS);
    window.setInterval(refreshSourceStatus, 5000);
    window.setInterval(refreshSelectedEventDisplay, 1000);
    maybeStartGuide();
  }

  function refreshPushWorker() {
    if (window.QuakePush) window.QuakePush.refreshExistingWorker();
  }

  async function loadSettings() {
    const params = new URLSearchParams(window.location.search);
    const requestedMap = params.get('map');
    const storedMap = await getItem('quakeMapSource', 'auto');
    state.mapSourceKey = requestedMap && MAP_SOURCES.some(source => source.key === requestedMap)
      ? requestedMap
      : storedMap;
    state.mapToken = params.get('tk') || params.get('tiandituToken') || await getItem('tiandituToken', '');
    state.themeMode = await getItem('quakeThemeMode', 'system');
    state.countryKey = await getItem('quakeCountry', DEFAULT_COUNTRY);
    state.regionKey = await getItem('quakeRegion', DEFAULT_REGION);
    state.notificationThreshold = clampNotificationThreshold(await getRequiredItem('quakeNotificationThreshold', '3'));
    state.mobileNotificationsEnabled = (await getRequiredItem('quakeDesktopNotifications', 'false')) === 'true';
    state.notificationArea = readNotificationArea(await getRequiredItem('quakeNotificationArea', '{}'));
    state.userLocation = { ...DEFAULT_LOCATION, ...(await getJson('quakeUserLocation', DEFAULT_LOCATION)) };
    state.autoLocationRequested = (await getItem('quakeLocationAutoRequested', 'false')) === 'true';
    if (state.userLocation.source === 'default') state.userLocation = { ...DEFAULT_LOCATION };
    if (!MAP_SOURCES.some(source => source.key === state.mapSourceKey)) state.mapSourceKey = 'auto';
    if (!['system', 'dark', 'light'].includes(state.themeMode)) state.themeMode = 'system';
    if (!AREA_OPTIONS.some(area => area.key === state.countryKey)) state.countryKey = DEFAULT_COUNTRY;
  }

  function clampNotificationThreshold(value) {
    const number = Number(value);
    return [3, 4, 5, 6].includes(number) ? number : 3;
  }

  function readNotificationArea(value) {
    try {
      const area = JSON.parse(value || '{}');
      return {
        country: area.country || state.countryKey || DEFAULT_COUNTRY,
        region: area.region || DEFAULT_REGION,
        province: area.province || 'all',
        city: area.city || 'all',
        district: area.district || 'all'
      };
    } catch (_error) {
      return { country: DEFAULT_COUNTRY, region: DEFAULT_REGION, province: 'all', city: 'all', district: 'all' };
    }
  }

  async function loadMapConfig() {
    const bootstrapConfig = window.__QUAKE_CONFIG__ && typeof window.__QUAKE_CONFIG__ === 'object'
      ? window.__QUAKE_CONFIG__
      : {};
    state.mapConfig = bootstrapConfig;
    if (!Object.keys(bootstrapConfig).length) {
      try {
        const response = await fetch('/config', { cache: 'no-store', credentials: 'same-origin' });
        state.mapConfig = response.ok ? await response.json() : {};
      } catch (_error) {
        state.mapConfig = {};
      }
    }
    window.__QUAKE_CONFIG__ = { ...bootstrapConfig, ...state.mapConfig };
    state.mapConfig = window.__QUAKE_CONFIG__;
    state.mapToken = state.mapToken || state.mapConfig.tiandituToken || '';
    if (
      state.mapConfig.yandexQuotaExhausted &&
      (state.mapSourceKey === 'auto' || state.mapSourceKey === 'yandex')
    ) {
      state.mapSourceKey = 'google';
      state.pendingMapNotice = 'Yandex 今日 100 次额度已用完，已自动切换到 Google 地图';
    } else if (state.mapSourceKey === 'yandex' && !state.mapConfig.yandexMapsAvailable) {
      state.mapSourceKey = 'auto';
      setItem('quakeMapSource', state.mapSourceKey);
    }
    if (window.OfficialMap && typeof window.OfficialMap.prepare === 'function') {
      window.OfficialMap.prepare(state.mapSourceKey || 'auto', mobileMapOptions()).catch(() => {});
    }
  }

  function bindControls() {
    const themeSwitch = $('theme-switch');
    if (themeSwitch) {
      themeSwitch.checked = (state.themeMode === 'system' ? detectTheme() : state.themeMode) === 'dark';
      themeSwitch.addEventListener('change', () => {
        state.themeMode = themeSwitch.checked ? 'dark' : 'light';
        setItem('quakeThemeMode', state.themeMode);
        applyTheme();
      });
    }
    initAutoTheme();

    initAreaControls();

    const token = $('map-token');
    if (token) token.value = state.mapToken;
    $('save-map-token')?.addEventListener('click', () => {
      state.mapToken = token ? token.value.trim() : '';
      setItem('tiandituToken', state.mapToken);
      updateTokenVisibility();
      renderMapSourceControls();
      renderMapLayer();
      showToast('地图设置已保存');
    });

    $('mobile-menu-open')?.addEventListener('click', openDrawer);
    $('mobile-menu-close')?.addEventListener('click', closeDrawer);
    $('mobile-drawer-backdrop')?.addEventListener('click', closeDrawer);
    $('mobile-message-close')?.addEventListener('click', () => $('mobile-message-dialog')?.classList.remove('show'));
    const locationPill = $('location-pill');
    if (locationPill) {
      locationPill.addEventListener('click', refreshBrowserLocation);
      locationPill.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        refreshBrowserLocation();
      });
    }

    $('mobile-event-list')?.addEventListener('click', event => {
      const button = event.target.closest('[data-key]');
      if (!button) return;
      state.selectedKey = button.dataset.key;
      renderAll();
      updateMap(selectedEvent());
    });

    $('mobile-map-source-buttons')?.addEventListener('click', event => {
      const button = event.target.closest('[data-map-source]');
      if (!button) return;
      activateMobileMapSource(button.dataset.mapSource);
    });
    $('map-source')?.addEventListener('change', event => {
      if (!activateMobileMapSource(event.target.value)) event.target.value = state.mapSourceKey;
    });

    $('mobile-debug-enable')?.addEventListener('click', toggleDebugMode);
    $('mobile-debug-add-history')?.addEventListener('click', addDebugEarthquakeEvent);
    $('mobile-debug-test-notification')?.addEventListener('click', testMobileNotification);
    $('mobile-debug-cookie')?.addEventListener('click', showDebugCookieBar);
    $('mobile-debug-cancel')?.addEventListener('click', closeDebugDialog);
    $('mobile-debug-confirm')?.addEventListener('click', confirmDebugPassword);
    $('mobile-debug-change-password')?.addEventListener('click', openDebugPasswordDialog);
    $('mobile-debug-password-cancel')?.addEventListener('click', closeDebugPasswordDialog);
    $('mobile-debug-password-save')?.addEventListener('click', changeDebugPassword);
    initMobileNotificationControls();
    const voiceToggle = $('mobile-voice-toggle');
    const voice = window.QuakeVoice;
    const voiceAvailable = Boolean(voice && voice.supported());
    if (voiceToggle) {
      voiceToggle.disabled = !voiceAvailable;
      voiceToggle.checked = voiceAvailable && voice.isEnabled();
      voiceToggle.addEventListener('change', () => {
        voiceToggle.checked = voice.setEnabled(voiceToggle.checked, { confirm: voiceToggle.checked });
        updateVoiceStatus(voiceToggle.checked, voiceAvailable);
      });
    }
    updateVoiceStatus(Boolean(voiceToggle && voiceToggle.checked), voiceAvailable);
    const debugNewPassword = $('mobile-debug-new-password');
    if (debugNewPassword) {
      debugNewPassword.addEventListener('input', () => updatePasswordRuleList('mobile-debug-password-rules', debugNewPassword.value));
      updatePasswordRuleList('mobile-debug-password-rules', debugNewPassword.value);
    }
    $('mobile-debug-password')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') confirmDebugPassword();
    });
    window.addEventListener('quake-yandex-quota', event => {
      state.mapConfig.yandexQuotaUsed = Number(event.detail && event.detail.used) || 0;
      state.mapConfig.yandexQuotaRemaining = Number(event.detail && event.detail.remaining) || 0;
      renderMapSourceControls();
    });
  }

  function detectTheme() {
    if (window.matchMedia) {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    }
    const hour = new Date().getHours();
    return hour >= 8 && hour < 19 ? 'light' : 'dark';
  }

  function updateVoiceStatus(active, available) {
    text('mobile-voice-status', !available
      ? '当前浏览器不支持语音播报'
      : active
        ? '地震语音播报已开启'
        : '语音播报未开启');
  }

  function initMobileNotificationControls() {
    const toggle = $('mobile-notification-toggle');
    const threshold = $('mobile-intensity-threshold');
    fillMobileNotificationAreaControls();
    updateMobileNotificationStatus();
    updateMobileNotificationSettingsVisibility();
    watchMobileNotificationPermission();
    bindMobilePushSubscriptionRefresh();
    if (threshold) {
      threshold.value = String(state.notificationThreshold);
      threshold.addEventListener('change', () => {
        state.notificationThreshold = clampNotificationThreshold(threshold.value);
        threshold.value = String(state.notificationThreshold);
        setRequiredItem('quakeNotificationThreshold', state.notificationThreshold);
        refreshMobilePushSettings();
      });
    }
    if (!toggle) return;
    const apiAvailable = Boolean(window.QuakePush && window.QuakePush.supported());
    toggle.disabled = !apiAvailable;
    toggle.checked = false;
    const canRestore = apiAvailable
      && window.QuakePush.isSecurePushContext()
      && Notification.permission === 'granted';
    if (state.mobileNotificationsEnabled && canRestore) {
      setMobileNotificationState(true);
      syncMobilePushSubscription(false).then(ready => {
        if (ready) updateMobileNotificationStatus();
        else updateMobileNotificationStatus('后台推送连接待恢复，将在网络恢复后自动重试');
      });
    } else if (state.mobileNotificationsEnabled) {
      setMobileNotificationState(false);
    }
    toggle.addEventListener('change', async () => {
      if (toggle.checked) await enableMobileNotifications();
      else await disableMobileNotifications();
    });
  }

  async function enableMobileNotifications() {
    try {
      if (!window.QuakePush) throw new Error('浏览器推送组件未加载，请强制刷新页面后重试。');
      await window.QuakePush.requestPermission();
      await window.QuakePush.ensureSubscription(mobilePushOptions());
      setMobileNotificationState(true);
    } catch (error) {
      setMobileNotificationState(false);
      showMessage('后台推送', mobilePushErrorMessage(error));
    }
  }

  async function disableMobileNotifications() {
    try {
      if (window.QuakePush) await window.QuakePush.unsubscribe(mobilePushOptions());
    } catch (_error) {
      // 关闭时以本地状态为准，失效订阅由服务端发送时清理。
    }
    setMobileNotificationState(false);
  }

  async function syncMobilePushSubscription(showFailure) {
    try {
      if (!window.QuakePush) throw new Error('浏览器推送组件未加载，请强制刷新页面后重试。');
      await window.QuakePush.ensureSubscription(mobilePushOptions());
      return true;
    } catch (error) {
      if (showFailure) showMessage('后台推送', mobilePushErrorMessage(error));
      return false;
    }
  }

  function setMobileNotificationState(enabled) {
    const active = Boolean(enabled);
    state.mobileNotificationsEnabled = active;
    setRequiredItem('quakeDesktopNotifications', active);
    const toggle = $('mobile-notification-toggle');
    if (toggle) toggle.checked = active;
    updateMobileNotificationStatus();
    updateMobileNotificationSettingsVisibility();
  }

  function mobilePushUnavailableText() {
    const isiOS = /iP(?:hone|ad|od)/.test(navigator.userAgent || '');
    const standalone = navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (isiOS && !standalone) return 'iPhone/iPad 需先将本站添加到主屏幕，再从主屏幕打开并开启后台推送';
    return '当前手机浏览器不支持后台推送';
  }

  function updateMobileNotificationStatus(message) {
    const status = $('mobile-notification-status');
    if (!status) return;
    if (message) {
      status.textContent = message;
      return;
    }
    if (!window.QuakePush || !window.QuakePush.supported()) status.textContent = mobilePushUnavailableText();
    else if (!window.QuakePush.isSecurePushContext()) status.textContent = '后台推送仅支持 HTTPS';
    else if (Notification.permission === 'denied') status.textContent = '通知权限已被浏览器阻止';
    else if (state.mobileNotificationsEnabled) status.textContent = '后台系统推送已开启';
    else status.textContent = '后台推送未开启';
  }

  function updateMobileNotificationSettingsVisibility() {
    $('mobile-notification-settings-panel')?.classList.toggle('is-hidden', !state.mobileNotificationsEnabled);
  }

  function watchMobileNotificationPermission() {
    if (!navigator.permissions || !navigator.permissions.query || watchMobileNotificationPermission.bound) return;
    watchMobileNotificationPermission.bound = true;
    navigator.permissions.query({ name: 'notifications' }).then(permission => {
      permission.onchange = () => {
        if (Notification.permission === 'denied') setMobileNotificationState(false);
        else updateMobileNotificationStatus();
      };
    }).catch(() => {});
  }

  function bindMobilePushSubscriptionRefresh() {
    if (bindMobilePushSubscriptionRefresh.bound) return;
    bindMobilePushSubscriptionRefresh.bound = true;
    const refresh = () => {
      if (!state.mobileNotificationsEnabled || Notification.permission !== 'granted' || !navigator.onLine) return;
      syncMobilePushSubscription(false).then(ready => {
        if (ready) updateMobileNotificationStatus();
        else updateMobileNotificationStatus('后台推送连接待恢复，将在网络恢复后自动重试');
      });
    };
    window.addEventListener('online', refresh);
    window.setInterval(refresh, 15 * 60 * 1000);
  }

  function refreshMobilePushSettings() {
    if (!state.mobileNotificationsEnabled) return;
    syncMobilePushSubscription(false).then(ready => {
      if (!ready) updateMobileNotificationStatus('推送条件待同步，将在网络恢复后自动重试');
    });
  }

  function fillMobileNotificationAreaControls() {
    const country = $('mobile-notify-country');
    const region = $('mobile-notify-region');
    const province = $('mobile-notify-province');
    const city = $('mobile-notify-city');
    const district = $('mobile-notify-district');
    if (!country || !region || !province || !city || !district) return;
    country.innerHTML = sortedAreaOptions()
      .map(area => `<option value="${escapeAttr(area.key)}">${escapeHtml(area.flag ? `${area.flag} ${area.label}` : area.label)}</option>`)
      .join('');
    country.value = notificationOptionValue(country, state.notificationArea.country);
    country.addEventListener('change', () => {
      state.notificationArea = { ...state.notificationArea, country: country.value, region: 'all', province: 'all', city: 'all', district: 'all' };
      updateMobileNotificationRegionOptions();
      saveMobileNotificationArea();
    });
    region.addEventListener('change', () => {
      state.notificationArea.region = region.value;
      saveMobileNotificationArea();
    });
    province.innerHTML = [{ code: 'all', name: '全国' }].concat(chinaAdmin)
      .map(item => `<option value="${escapeAttr(item.code)}">${escapeHtml(item.name)}</option>`)
      .join('');
    province.value = notificationOptionValue(province, state.notificationArea.province);
    province.addEventListener('change', () => {
      state.notificationArea = { ...state.notificationArea, province: province.value, city: 'all', district: 'all' };
      updateMobileNotificationCityOptions();
      saveMobileNotificationArea();
    });
    city.addEventListener('change', () => {
      state.notificationArea.city = city.value;
      state.notificationArea.district = 'all';
      updateMobileNotificationDistrictOptions();
      saveMobileNotificationArea();
    });
    district.addEventListener('change', () => {
      state.notificationArea.district = district.value;
      saveMobileNotificationArea();
    });
    updateMobileNotificationRegionOptions();
  }

  function updateMobileNotificationRegionOptions() {
    const region = $('mobile-notify-region');
    if (!region) return;
    const country = selectedMobileNotifyCountry();
    region.innerHTML = (country && country.regions || [{ key: 'all', label: '全部' }])
      .map(item => `<option value="${escapeAttr(item.key)}">${escapeHtml(item.label)}</option>`)
      .join('');
    region.value = notificationOptionValue(region, state.notificationArea.region);
    const regionRow = region.closest('.setting-field');
    if (regionRow) regionRow.classList.toggle('is-hidden', !country || (country.regions || []).length <= 1);
    if (state.notificationArea.country !== DEFAULT_COUNTRY) {
      state.notificationArea.province = 'all';
      state.notificationArea.city = 'all';
      state.notificationArea.district = 'all';
    }
    updateMobileNotificationCityOptions();
  }

  function updateMobileNotificationCityOptions() {
    const provinceSelect = $('mobile-notify-province');
    const city = $('mobile-notify-city');
    if (!provinceSelect || !city) return;
    const mainland = state.notificationArea.country === DEFAULT_COUNTRY;
    provinceSelect.closest('.setting-field')?.classList.toggle('is-hidden', !mainland);
    const province = selectedMobileNotifyProvince();
    if (!province) {
      state.notificationArea.city = 'all';
      state.notificationArea.district = 'all';
    }
    city.innerHTML = [{ code: 'all', name: '全部城市' }].concat(province ? province.cities || [] : [])
      .map(item => `<option value="${escapeAttr(item.code)}">${escapeHtml(item.name)}</option>`)
      .join('');
    city.value = notificationOptionValue(city, state.notificationArea.city);
    city.closest('.setting-field')?.classList.toggle('is-hidden', !mainland || !province);
    updateMobileNotificationDistrictOptions();
  }

  function updateMobileNotificationDistrictOptions() {
    const district = $('mobile-notify-district');
    if (!district) return;
    const city = selectedMobileNotifyCity();
    if (!city) state.notificationArea.district = 'all';
    district.innerHTML = [{ code: 'all', name: '全部区县' }].concat(city ? city.districts || [] : [])
      .map(item => `<option value="${escapeAttr(item.code)}">${escapeHtml(item.name)}</option>`)
      .join('');
    district.value = notificationOptionValue(district, state.notificationArea.district);
    district.closest('.setting-field')?.classList.toggle('is-hidden', !city);
  }

  function notificationOptionValue(select, value) {
    if (Array.from(select.options).some(option => option.value === value)) return value;
    if (Array.from(select.options).some(option => option.value === 'all')) return 'all';
    return select.options[0] ? select.options[0].value : 'all';
  }

  function selectedMobileNotifyCountry() {
    return AREA_OPTIONS.find(area => area.key === state.notificationArea.country)
      || AREA_OPTIONS.find(area => area.key === DEFAULT_COUNTRY);
  }

  function selectedMobileNotifyProvince() {
    return chinaAdmin.find(item => item.code === state.notificationArea.province) || null;
  }

  function selectedMobileNotifyCity() {
    const province = selectedMobileNotifyProvince();
    return province && (province.cities || []).find(item => item.code === state.notificationArea.city) || null;
  }

  function selectedMobileNotifyDistrict() {
    const city = selectedMobileNotifyCity();
    return city && (city.districts || []).find(item => item.code === state.notificationArea.district) || null;
  }

  function mobileNotificationAreaPayload() {
    const country = selectedMobileNotifyCountry();
    const region = country && (country.regions || []).find(item => item.key === state.notificationArea.region);
    const province = selectedMobileNotifyProvince();
    const city = selectedMobileNotifyCity();
    const district = selectedMobileNotifyDistrict();
    return {
      country: country ? country.key : DEFAULT_COUNTRY,
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

  function saveMobileNotificationArea() {
    state.notificationArea = mobileNotificationAreaPayload();
    setRequiredItem('quakeNotificationArea', JSON.stringify(state.notificationArea));
    refreshMobilePushSettings();
  }

  function applyTheme() {
    const resolved = state.themeMode === 'system' ? detectTheme() : state.themeMode;
    const datasetTheme = resolved === 'night' ? 'dark' : resolved;
    if (root.dataset.theme !== datasetTheme) {
      root.classList.add('theme-transitioning');
      window.clearTimeout(themeTransitionTimer);
      themeTransitionTimer = window.setTimeout(() => root.classList.remove('theme-transitioning'), THEME_TRANSITION_MS);
    }
    root.dataset.theme = datasetTheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', root.dataset.theme === 'light' ? '#f4f7fb' : '#07111f');
    const themeSwitch = $('theme-switch');
    if (themeSwitch) themeSwitch.checked = root.dataset.theme === 'dark';
  }

  function initAutoTheme() {
    if (initAutoTheme.bound) return;
    initAutoTheme.bound = true;
    const refresh = () => {
      if (state.themeMode !== 'system') return;
      const before = root.dataset.theme;
      applyTheme();
      if (root.dataset.theme !== before) window.dispatchEvent(new Event('resize'));
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

  async function initMap() {
    const mapNode = $('map');
    if (!mapNode) return;
    if (!window.OfficialMap || typeof window.OfficialMap.create !== 'function') {
      showToast('地图适配器未加载，请刷新页面');
      return;
    }
    bindMapFocusControls();
    await renderMapLayer();
  }

  async function renderMapLayer() {
    if (!window.OfficialMap) return;
    const loadId = ++state.mapLoadId;
    const requested = state.mapSourceKey || 'auto';
    const options = mobileMapOptions();
    const availability = window.OfficialMap.availability(requested, options);
    renderMapSourceControls();
    if (requested !== 'auto' && !availability.available) {
      showToast(requested === 'tianditu' ? '请输入天地图 token' : availability.reason);
      return;
    }
    const candidates = window.OfficialMap.candidates(requested, options);
    if (!candidates.length) {
      showToast('暂无可用地图源');
      return;
    }
    const event = selectedEvent();
    const center = event && Number.isFinite(Number(event.latitude)) && Number.isFinite(Number(event.longitude))
      ? [Number(event.latitude), Number(event.longitude)]
      : [35.8, 104.2];
    const zoom = event && Number(event.magnitude) >= 5 ? 6 : event ? 5 : 4;
    destroyMobileMap();
    const stage = $('mobile-map-stage');
    let lastError = '';
    for (const key of candidates) {
      try {
        if (stage) stage.dataset.mapSource = key;
        const map = await window.OfficialMap.create(key, 'map', {
          ...options,
          center,
          zoom
        });
        if (loadId !== state.mapLoadId) {
          map.destroy();
          return;
        }
        state.map = map;
        state.activeMapSource = key;
        state.lastUsableMapSource = key;
        updateMap(selectedEvent());
        flushMobileMapNotice();
        return;
      } catch (error) {
        if (error && error.code === 'quota_exhausted' && error.fallback === 'google') {
          fallbackMobileFromYandexQuota();
          return;
        }
        lastError = String(error && error.message || '地图加载失败');
        if (requested !== 'auto') break;
      }
    }
    if (loadId === state.mapLoadId) showToast(lastError || '地图服务暂时不可用');
  }

  function mobileMapOptions() {
    return {
      config: state.mapConfig,
      token: state.mapToken,
      countryCode: state.mapConfig.clientCountryCode || (state.countryKey === 'CN_MAINLAND' ? 'CN' : '')
    };
  }

  function destroyMobileMap() {
    if (state.marker) state.marker.remove();
    if (state.waveMarker) state.waveMarker.remove();
    if (state.userMarker) state.userMarker.remove();
    state.marker = null;
    state.waveMarker = null;
    state.userMarker = null;
    if (state.map && typeof state.map.destroy === 'function') state.map.destroy();
    state.map = null;
  }

  function updateMap(event) {
    if (!state.map || !window.OfficialMap) return;
    if (!event || !Number.isFinite(Number(event.latitude)) || !Number.isFinite(Number(event.longitude))) {
      clearMapEventMarkers();
      return;
    }
    const latlng = [Number(event.latitude), Number(event.longitude)];
    const intensityText = eventIntensityText(event);
    const label = `${formatNumber(event.magnitude, '级', 1)} / ${intensityText.localShort}`;
    const icon = window.OfficialMap.divIcon({
      className: 'epicenter-marker',
      html: `<span class="quake-label ${severityClass(event)}">${escapeHtml(label)}</span><span class="quake-dot"></span>`,
      iconSize: [1, 1],
      iconAnchor: [0, 0]
    });
    if (!state.marker) state.marker = window.OfficialMap.marker(latlng, { icon, interactive: false }).addTo(state.map);
    else state.marker.setLatLng(latlng).setIcon(icon);

    const size = wavePixelSize(event.depth);
    const waveIcon = window.OfficialMap.divIcon({
      className: 'wave-marker',
      html: '<span></span>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
    if (!state.waveMarker) state.waveMarker = window.OfficialMap.marker(latlng, { icon: waveIcon, interactive: false }).addTo(state.map);
    else state.waveMarker.setLatLng(latlng).setIcon(waveIcon);

    if (Number.isFinite(Number(state.userLocation.lat)) && Number.isFinite(Number(state.userLocation.lon))) {
      updateUserLocationMarker();
    }
    if (state.mapFocusTarget !== 'user') {
      state.map.flyTo(latlng, Number(event.magnitude) >= 5 ? 6 : 5, { animate: true, duration: 0.7 });
    }
    window.setTimeout(() => state.map && state.map.invalidateSize(), 60);
  }

  function clearMapEventMarkers() {
    if (state.marker) {
      state.marker.remove();
      state.marker = null;
    }
    if (state.waveMarker) {
      state.waveMarker.remove();
      state.waveMarker = null;
    }
    updateUserLocationMarker();
  }

  function updateUserLocationMarker() {
    if (!state.map || !window.OfficialMap) return;
    if (!hasUserLocation()) {
      if (state.userMarker) {
        state.userMarker.remove();
        state.userMarker = null;
      }
      return;
    }
    const userLatLng = [Number(state.userLocation.lat), Number(state.userLocation.lon)];
    const userIcon = window.OfficialMap.divIcon({
      className: 'user-location-marker',
      html: '<span></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    if (!state.userMarker) state.userMarker = window.OfficialMap.marker(userLatLng, { icon: userIcon, interactive: false }).addTo(state.map);
    else state.userMarker.setLatLng(userLatLng).setIcon(userIcon);
  }

  function bindMapFocusControls() {
    if (bindMapFocusControls.bound) return;
    bindMapFocusControls.bound = true;
    document.querySelectorAll('[data-map-focus]').forEach(button => {
      button.addEventListener('click', () => focusMapPoint(button.dataset.mapFocus));
    });
  }

  function focusMapPoint(target) {
    if (!state.map) {
      showMobileMapNotice('地图尚未加载完成，请稍后重试');
      return;
    }
    const focusRequestId = ++state.mapFocusRequestId;
    state.mapFocusTarget = target;
    setMapFocusSelection(target);
    if (target === 'user') {
      if (hasUserLocation()) {
        const precise = state.userLocation.source === 'browser';
        centerMobileUserLocation(precise ? '已将您的位置移到地图中心' : '已显示估算位置，正在更新精确定位', true);
        if (precise) return;
      } else if (state.userContextPromise) {
        state.userContextPromise.then(() => {
          if (focusRequestId === state.mapFocusRequestId && hasUserLocation()) {
            centerMobileUserLocation('已显示估算位置，正在更新精确定位', true);
          }
        }).catch(() => {});
      }
      requestBrowserLocation(true, focusRequestId);
      return;
    }
    const event = selectedEvent();
    if (event && Number.isFinite(Number(event.latitude)) && Number.isFinite(Number(event.longitude))) {
      state.map.flyTo([Number(event.latitude), Number(event.longitude)], Math.max(state.map.getZoom(), Number(event.magnitude) >= 5 ? 6 : 5), { animate: true, duration: 0.55 });
      showMobileMapNotice('已将震中移到地图中心');
    } else {
      showMobileMapNotice('当前事件缺少震中坐标');
    }
  }

  function setMapFocusSelection(target) {
    document.querySelectorAll('[data-map-focus]').forEach(button => {
      const selected = button.dataset.mapFocus === target;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function renderMapSourceControls() {
    const select = $('map-source');
    if (select) {
      select.innerHTML = MAP_SOURCES.map(source => {
        const disabled = mobileMapSourceDisabled(source.key);
        return `<option value="${escapeAttr(source.key)}"${disabled ? ' disabled' : ''}>${escapeHtml(source.label)}</option>`;
      }).join('');
      select.value = state.mapSourceKey;
    }
    const buttons = $('mobile-map-source-buttons');
    if (buttons) {
      buttons.innerHTML = MAP_SOURCES.map(source => {
        const availability = mobileMapSourceAvailability(source.key);
        const disabled = mobileMapSourceDisabled(source.key);
        const title = disabled || availability.externalOnly ? availability.reason : `切换到${source.label}`;
        return `
        <button type="button" data-map-source="${escapeAttr(source.key)}" class="${source.key === state.mapSourceKey ? 'active' : ''}" aria-label="${escapeAttr(title)}" title="${escapeAttr(title)}"${disabled ? ' disabled aria-disabled="true"' : ''}>
          ${escapeHtml(source.label)}
        </button>
      `;
      }).join('');
    }
    updateTokenVisibility();
  }

  function mobileMapSourceAvailability(key) {
    if (!window.OfficialMap || typeof window.OfficialMap.availability !== 'function') {
      return { available: key === 'auto', reason: '地图适配器未加载' };
    }
    return window.OfficialMap.availability(key, mobileMapOptions());
  }

  function mobileMapSourceDisabled(key) {
    if (key === 'auto' || key === 'tianditu') return false;
    return !mobileMapSourceAvailability(key).available;
  }

  function updateTokenVisibility() {
    const row = $('token-row');
    const visible = state.mapSourceKey === 'tianditu';
    row?.classList.toggle('is-hidden', !visible);
    row?.setAttribute('aria-hidden', String(!visible));
  }

  function activateMobileMapSource(key) {
    const availability = mobileMapSourceAvailability(key);
    if (availability.externalOnly) {
      openMobileExternalMapSource(key);
      return false;
    }
    state.mapSourceKey = key;
    setItem('quakeMapSource', state.mapSourceKey);
    renderMapSourceControls();
    renderMapLayer();
    if (key === 'tianditu') {
      window.requestAnimationFrame(() => $('map-token')?.focus());
    }
    return true;
  }

  function openMobileExternalMapSource(key) {
    const event = selectedEvent();
    const center = event && Number.isFinite(Number(event.latitude)) && Number.isFinite(Number(event.longitude))
      ? [Number(event.latitude), Number(event.longitude)]
      : [35.8, 104.2];
    const zoom = event && Number(event.magnitude) >= 5 ? 6 : event ? 5 : 4;
    const url = window.OfficialMap && window.OfficialMap.externalUrl
      ? window.OfficialMap.externalUrl(key, { center, zoom })
      : '';
    if (!url) {
      showToast('暂时无法生成 Google Maps 地址');
      return;
    }
    const opened = window.open(url, '_blank');
    if (opened) opened.opener = null;
    else showToast('请允许本站打开新窗口后重试');
  }

  function fallbackMobileFromYandexQuota() {
    state.mapConfig.yandexQuotaUsed = Number(state.mapConfig.yandexDailyLimit) || 100;
    state.mapConfig.yandexQuotaRemaining = 0;
    state.mapConfig.yandexQuotaExhausted = true;
    state.mapConfig.yandexMapsAvailable = false;
    state.mapSourceKey = 'google';
    state.pendingMapNotice = 'Yandex 今日 100 次额度已用完，已自动切换到 Google 地图';
    renderMapSourceControls();
    renderMapLayer();
  }

  function flushMobileMapNotice() {
    if (!state.pendingMapNotice) return;
    showMobileMapNotice(state.pendingMapNotice);
    state.pendingMapNotice = '';
  }

  function showMobileMapNotice(message) {
    const slot = $('mobile-map-notice-slot');
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

  function initAreaControls() {
    const countrySelect = $('mobile-country-select');
    const regionSelect = $('mobile-region-select');
    if (!countrySelect || !regionSelect) return;
    countrySelect.innerHTML = sortedAreaOptions()
      .map(area => `<option value="${escapeAttr(area.key)}">${escapeHtml(area.flag ? `${area.flag} ${area.label}` : area.label)}</option>`)
      .join('');
    countrySelect.value = AREA_OPTIONS.some(area => area.key === state.countryKey) ? state.countryKey : DEFAULT_COUNTRY;
    state.countryKey = countrySelect.value;
    fillRegionOptions();
    countrySelect.addEventListener('change', () => {
      state.countryKey = countrySelect.value || DEFAULT_COUNTRY;
      state.regionKey = DEFAULT_REGION;
      setItem('quakeCountry', state.countryKey);
      setItem('quakeRegion', state.regionKey);
      fillRegionOptions();
      applyAreaChange();
    });
    regionSelect.addEventListener('change', () => {
      state.regionKey = regionSelect.value || DEFAULT_REGION;
      setItem('quakeRegion', state.regionKey);
      applyAreaChange();
    });
  }

  function fillRegionOptions() {
    const regionSelect = $('mobile-region-select');
    const area = AREA_OPTIONS.find(item => item.key === state.countryKey);
    if (!regionSelect) return;
    const regions = area && Array.isArray(area.regions) ? area.regions : [];
    regionSelect.innerHTML = [`<option value="all">全部区域</option>`]
      .concat(regions.map(region => `<option value="${escapeAttr(region.key)}">${escapeHtml(region.label)}</option>`))
      .join('');
    if (!regions.some(region => region.key === state.regionKey)) state.regionKey = DEFAULT_REGION;
    regionSelect.value = state.regionKey;
  }

  function sortedAreaOptions() {
    const priority = ['GLOBAL', DEFAULT_COUNTRY];
    const first = priority.map(key => AREA_OPTIONS.find(area => area.key === key)).filter(Boolean);
    const rest = AREA_OPTIONS
      .filter(area => !priority.includes(area.key))
      .sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'zh-Hans-u-co-pinyin'));
    return first.concat(rest);
  }

  function applyAreaChange() {
    state.events = [];
    state.selectedKey = '';
    state.historyError = '';
    sendFilter();
    refreshHistory();
    renderAll();
  }

  function connect() {
    if (!window.WebSocket) {
      setConnectionStatus('disconnected');
      return;
    }
    if (state.ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.ws.readyState)) return;
    if (state.serverConnectionState !== 'disconnected') setConnectionStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(wsUrl());
    } catch (_error) {
      setConnectionStatus('disconnected');
      window.setTimeout(connect, state.reconnectDelay);
      state.reconnectDelay = Math.min(30000, Math.round(state.reconnectDelay * 1.6));
      return;
    }
    state.ws = ws;
    ws.onopen = () => {
      state.reconnectDelay = 1000;
      setConnectionStatus('connected');
      sendFilter();
    };
    ws.onmessage = event => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (_error) {
        return;
      }
      if (payload.type === 'hello') {
        state.dataReady = true;
        updateSourceStatus(Array.isArray(payload.sources) ? payload.sources : [], true);
        upsertEvents(Array.isArray(payload.events) ? payload.events : [], true, true);
      } else if (payload.type === 'history') {
        state.dataReady = true;
        upsertEvents(Array.isArray(payload.events) ? payload.events : [], true, true);
      } else if (payload.type === 'source_status' && payload.source) {
        updateSourceStatus([payload.source]);
      } else if (payload.type === 'event') {
        upsertEvents([payload.event], false, false);
      }
    };
    ws.onerror = () => setConnectionStatus('disconnected');
    ws.onclose = () => {
      state.ws = null;
      setConnectionStatus('disconnected');
      window.setTimeout(connect, state.reconnectDelay);
      state.reconnectDelay = Math.min(30000, Math.round(state.reconnectDelay * 1.6));
    };
  }

  function wsUrl() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}/ws`;
  }

  function sendFilter() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({
      type: 'area_filter',
      country: state.countryKey || DEFAULT_COUNTRY,
      region: state.regionKey || DEFAULT_REGION,
      location: state.userLocation
    }));
  }

  async function refreshHistory() {
    try {
      state.historyError = '';
      const query = new URLSearchParams({
        country: state.countryKey || DEFAULT_COUNTRY,
        region: state.regionKey || DEFAULT_REGION,
        limit: String(MAX_EVENTS),
        refresh: '1'
      });
      if (hasUserLocation()) {
        query.set('lat', String(state.userLocation.lat));
        query.set('lon', String(state.userLocation.lon));
        query.set('place', state.userLocation.place || '用户位置');
      }
      const response = await fetch(`/history?${query}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`历史接口 HTTP ${response.status}`);
      const data = response.ok ? await response.json() : {};
      state.dataReady = true;
      let events = Array.isArray(data.events) ? data.events : [];
      if (!events.length && hasUserLocation() && (state.countryKey || DEFAULT_COUNTRY) === DEFAULT_COUNTRY) {
        const nearby = await fetch(`/api/nearby-earthquakes?${new URLSearchParams({
          lat: String(state.userLocation.lat),
          lon: String(state.userLocation.lon),
          place: state.userLocation.place || '用户位置',
          limit: '20',
          sort: 'time'
        })}`, { cache: 'no-store' });
        if (!nearby.ok) throw new Error(`附近地震接口 HTTP ${nearby.status}`);
        const nearbyData = nearby.ok ? await nearby.json() : {};
        events = Array.isArray(nearbyData.data) ? nearbyData.data.map(nearbyApiEvent) : [];
      }
      upsertEvents(events, true, true);
    } catch (_error) {
      state.historyError = '历史接口暂不可用，保留已接收的实时和缓存事件。';
      renderAll();
      showToast('暂时无法刷新历史地震');
    }
  }

  async function refreshSourceStatus() {
    try {
      const response = await fetch('/sources', { cache: 'no-store' });
      if (!response.ok) throw new Error(`信源接口 HTTP ${response.status}`);
      const payload = await response.json();
      updateSourceStatus(Array.isArray(payload.sources) ? payload.sources : [], true);
    } catch (_error) {
      if (!hasFreshSourceSnapshot()) state.hasSourceSnapshot = false;
      renderSourceStatus();
    }
  }

  function updateSourceStatus(sources, replace = false) {
    if (replace) state.sources.clear();
    state.hasSourceSnapshot = true;
    state.sourceSnapshotAt = Date.now();
    (sources || []).forEach(source => {
      if (source && source.key) state.sources.set(source.key, source);
    });
    renderSourceStatus();
  }

  function hasFreshSourceSnapshot() {
    return state.hasSourceSnapshot
      && state.sourceSnapshotAt > 0
      && Date.now() - state.sourceSnapshotAt <= SOURCE_SNAPSHOT_MAX_AGE_MS;
  }

  function setConnectionStatus(status) {
    state.serverConnectionState = ['connecting', 'connected', 'disconnected'].includes(status) ? status : 'disconnected';
    renderSourceStatus();
  }

  function upsertEvents(events, isHistory, silent) {
    const beforeKeys = new Set(state.events.map(event => event.eventKey));
    let added = false;
    for (const raw of events || []) {
      const event = normalizeClientEvent(raw, isHistory);
      if (!event || !isRealEarthquake(event) || (!event.debugForceVisible && !matchesArea(event, state.countryKey || DEFAULT_COUNTRY, state.regionKey || DEFAULT_REGION))) continue;
      const index = state.events.findIndex(item => item.eventKey === event.eventKey);
      if (index >= 0) state.events[index] = { ...state.events[index], ...event };
      else {
        state.events.unshift(event);
        added = true;
        if (!silent && !event.isHistory) {
          state.selectedKey = event.eventKey;
          state.mapFocusTarget = 'epicenter';
          state.mapFocusRequestId += 1;
          setMapFocusSelection('epicenter');
          if (window.QuakeVoice) window.QuakeVoice.announce(event);
        }
      }
    }
    state.events = state.events
      .sort((a, b) => eventTime(b) - eventTime(a))
      .slice(0, MAX_EVENTS);
    if (!state.selectedKey && state.events[0]) state.selectedKey = state.events[0].eventKey;
    renderAll(beforeKeys, added);
  }

  function normalizeClientEvent(raw, isHistory) {
    if (!raw || typeof raw !== 'object') return null;
    const location = standardizePlaceName(raw.location || raw.placeName || raw.HypoCenter || raw.place || raw.eventName) || '未知震中';
    const magnitude = Number(raw.magnitude ?? raw.Magnitude ?? raw.mag ?? raw.M);
    const event = {
      ...raw,
      source: raw.source || 'cenc_eqlist',
      sourceLabel: raw.sourceLabel || sourceLabel(raw.source) || '中国地震台网',
      eventId: raw.eventId || raw.EventID || raw.id || raw.report_id || raw.eq_id || '',
      location,
      magnitude,
      depth: raw.depth ?? raw.depthKm ?? raw.Depth,
      latitude: Number(raw.latitude ?? raw.Latitude ?? raw.lat),
      longitude: Number(raw.longitude ?? raw.Longitude ?? raw.lon ?? raw.lng),
      intensity: raw.intensity || raw.MaxIntensity || raw.maxIntensity || '',
      originTime: raw.originTime || raw.OriginTime || raw.time || raw.happen_time || raw.startAt || '',
      receivedAt: raw.receivedAt || new Date().toISOString(),
      isHistory: Boolean(isHistory || raw.isHistory),
      isLive: Boolean(!isHistory && (raw.isLive || !raw.isHistory))
    };
    event.eventKey = raw.eventKey || getEventKey(event);
    return event;
  }

  function nearbyApiEvent(event) {
    return {
      source: 'cenc_eqlist_api',
      sourceLabel: '中国地震台网',
      eventId: event.eventId || event.no || '',
      location: event.location || event.placeName,
      magnitude: event.magnitude,
      depth: event.depthKm ?? event.depth,
      latitude: event.latitude,
      longitude: event.longitude,
      intensity: event.intensity || '',
      originTime: event.originTime,
      receivedAt: event.receivedAt || new Date().toISOString(),
      isHistory: true,
      isLive: false,
      rawData: event.raw || event
    };
  }

  function sourceLabel(key) {
    const source = ALL_SOURCES.find(item => item.key === key);
    return source ? source.label : '';
  }

  function eventTime(event) {
    const parsed = Date.parse(event && (event.originTime || event.receivedAt));
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function selectedEvent() {
    return state.events.find(event => event.eventKey === state.selectedKey) || state.events[0] || null;
  }

  function renderAll(oldKeys, added) {
    renderHeader();
    refreshSelectedEventDisplay();
    renderEvents(oldKeys, added);
    syncAreaControls();
    updateMap(selectedEvent());
  }

  function refreshSelectedEventDisplay() {
    renderLatest();
    renderDetail(selectedEvent());
  }

  function renderHeader() {
    const label = state.userLocation.adminPlace || state.userLocation.place || (state.userLocation.source === 'browser' ? '定位中' : '点击重新定位');
    text('current-admin', standardizePlaceName(label));
  }

  function renderLatest() {
    const event = selectedEvent();
    if (!event) {
      const connecting = !state.dataReady && !state.historyError;
      document.body.dataset.dataState = connecting ? 'connecting' : state.historyError ? 'error' : 'ready';
      updateMobileEventState(null, null);
      text('selected-source', connecting ? '正在连接服务器中' : '等待数据');
      text('selected-status', connecting ? '连接中' : state.historyError ? '接口异常' : '暂无记录');
      setSeverityTone('selected-status', null);
      renderMobileEventLocation(null, connecting ? '等待服务器返回地震数据' : '当前区域暂无地震记录');
      text('selected-mag', '-- 级');
      setMagnitudeTone('selected-mag', null);
      text('selected-depth', '--');
      text('selected-intensity', '--');
      setIntensityTone('selected-intensity', null);
      text('selected-distance', '--');
      text('selected-p', '--');
      text('mobile-s-count', '--');
      text('selected-action', connecting ? '正在获取历史数据与实时信源状态' : '服务器缓存更新后会自动显示最近地震。');
      return;
    }
    document.body.dataset.dataState = 'ready';
    const wave = waveForDisplay(event);
    const intensityText = eventIntensityText(event);
    const localIntensity = intensityText.local;
    const level = magnitudeIntensity(event.magnitude);
    updateMobileEventState(event, wave);
    text('selected-source', event.sourceLabel || sourceLabel(event.source) || '中国地震台网');
    text('selected-status', level.label);
    setSeverityTone('selected-status', event);
    renderMobileEventLocation(event, event.location || '未知震中');
    text('selected-mag', formatNumber(event.magnitude, ' 级', 1));
    setMagnitudeTone('selected-mag', event);
    text('selected-depth', formatNumber(event.depth, ' km', 0));
    text('selected-intensity', intensityText.localValue);
    setIntensityTone('selected-intensity', localIntensity.level);
    text('selected-distance', wave.distanceKm == null ? '--' : formatNumber(wave.distanceKm, ' km', 0));
    text('selected-p', event.isHistory ? '已结束' : formatCountdown(wave.p, '已到达'));
    text('mobile-s-count', event.isHistory ? '已结束' : formatCountdown(wave.s, '已到达'));
    text('selected-action', actionText(event, localIntensity));
  }

  function renderEvents(oldKeys, added) {
    const list = $('mobile-event-list');
    if (!list) return;
    const oldPositions = capturePositions(list);
    if (!state.events.length) {
      const message = !state.dataReady && !state.historyError
        ? '正在连接服务器中'
        : state.historyError || '当前区域暂无地震记录，等待历史缓存或实时数据接入。';
      list.innerHTML = `<article class="empty-state">${escapeHtml(message)}</article>`;
      return;
    }
    list.innerHTML = state.events.map(event => {
      const level = magnitudeIntensity(event.magnitude);
      const isNew = oldKeys && !oldKeys.has(event.eventKey);
      return `
        <button class="event ${severityClass(event)}${event.eventKey === state.selectedKey ? ' active' : ''}${isNew ? ' is-new' : ''}" type="button" data-key="${escapeAttr(event.eventKey)}" aria-label="${escapeAttr(`${event.location || '未知震中'}，${formatNumber(event.magnitude, '级', 1)}，${timeLine(event)}，${level.label}`)}">
          <strong>${escapeHtml(formatNumber(event.magnitude, '', 1))}</strong>
          <span><b>${escapeHtml(event.location || '未知震中')}</b><small>${escapeHtml(timeLine(event))} · ${escapeHtml(level.label)}</small></span>
        </button>
      `;
    }).join('');
    animateList(list, oldPositions);
    if (added) list.classList.add('has-new-event');
    window.setTimeout(() => list.classList.remove('has-new-event'), 500);
  }

  function renderDetail(event) {
    if (!event) {
      [
        'detail-origin',
        'detail-received',
        'detail-magnitude',
        'detail-depth',
        'detail-coords',
        'detail-intensity',
        'detail-warning-time',
        'detail-distance',
        'detail-radius',
        'detail-sources',
        'detail-source',
        'detail-event-id'
      ].forEach(id => text(id, '--'));
      setMagnitudeTone('detail-magnitude', null);
      setIntensityTone('detail-intensity', null);
      return;
    }
    const wave = waveForDisplay(event);
    const intensityText = eventIntensityText(event);
    const localIntensity = intensityText.local;
    text('detail-origin', formatTimeWithZone(event.originTime, 'stacked'));
    text('detail-received', formatTimeWithZone(event.receivedAt, 'stacked'));
    text('detail-magnitude', formatNumber(event.magnitude, ' 级', 1));
    setMagnitudeTone('detail-magnitude', event);
    text('detail-depth', formatNumber(event.depth, ' km', 0));
    text('detail-coords', formatCoordinatePair(event.latitude, event.longitude));
    text('detail-intensity', intensityText.localShort);
    setIntensityTone('detail-intensity', localIntensity.level);
    text('detail-warning-time', event.isHistory ? '已结束' : `P ${formatCountdown(wave.p, '已到达')} / S ${formatCountdown(wave.s, '已到达')}`);
    text('detail-distance', wave.distanceKm == null ? '--' : formatNumber(wave.distanceKm, ' km', 0));
    text('detail-radius', intensityText.epicenterShort);
    text('detail-sources', event.sourceLabel || sourceLabel(event.source) || '中国地震台网');
    text('detail-source', event.sourceLabel || sourceLabel(event.source) || '中国地震台网');
    text('detail-event-id', event.eventId || event.eventKey || '--');
  }

  function syncAreaControls() {
    const countrySelect = $('mobile-country-select');
    const regionSelect = $('mobile-region-select');
    if (countrySelect && countrySelect.value !== state.countryKey) countrySelect.value = state.countryKey;
    if (regionSelect && regionSelect.value !== state.regionKey) regionSelect.value = state.regionKey;
  }

  function renderSourceStatus() {
    const list = $('mobile-source-list');
    const summary = $('mobile-source-summary-text');
    const channel = $('mobile-channel-status');
    const viewSources = ALL_SOURCES.map(source => ({
      ...source,
      ...(state.sources.get(source.key) || {})
    }));
    const activeSources = viewSources.filter(source => (source.status || 'closed') !== 'closed');
    const connected = activeSources.filter(source => source.status === 'connected').length;
    const hasFreshSnapshot = hasFreshSourceSnapshot();
    const sourceTone = connected === 0 ? 'offline' : connected < MIN_HEALTHY_SOURCE_COUNT ? 'warning' : 'connected';
    if (summary) {
      summary.classList.remove('connected', 'warning', 'offline');
      summary.classList.add(hasFreshSnapshot ? sourceTone : 'warning');
      summary.textContent = hasFreshSnapshot ? `信源在线 ${connected}/${activeSources.length}` : '信源状态载入中';
    }
    if (channel) {
      const channelState = liveChannelStatus(
        connected,
        state.serverConnectionState,
        hasFreshSnapshot,
        MIN_HEALTHY_SOURCE_COUNT
      );
      channel.classList.remove('connected', 'warning', 'offline');
      channel.classList.add(channelState.tone);
      channel.textContent = channelState.label;
    }
    if (list) {
      list.innerHTML = viewSources.map(source => {
        const status = source.status || 'closed';
        return `<span data-status="${escapeAttr(status)}" role="listitem" aria-label="${escapeAttr(`${source.label || source.key}：${statusLabels[status] || '待确认'}`)}"><b>${escapeHtml(source.label || source.key)}</b><em>${escapeHtml(statusLabels[status] || '待确认')}</em></span>`;
      }).join('');
    }
  }

  function waveForDisplay(event) {
    const local = estimateWaveCountdowns(event, hasUserLocation() ? state.userLocation : null);
    if (local && (local.distanceKm !== null || local.p !== null || local.s !== null)) return local;
    return event && event.arrival ? event.arrival : local;
  }

  function updateMobileEventState(event, wave) {
    const stateName = !event
      ? (state.historyError ? 'error' : 'empty')
      : event.isHistory
        ? 'history'
        : wave && [wave.p, wave.s].some(value => Number.isFinite(Number(value)) && Number(value) > 0)
          ? 'warning'
          : 'arrived';
    document.body.dataset.quakeState = stateName;
  }

  function severityClass(event) {
    const magnitude = Number(event && event.magnitude);
    if (magnitude >= 5) return 'high';
    if (magnitude >= 4) return 'mid';
    return 'low';
  }

  function setMagnitudeTone(id, event) {
    const node = $(id);
    if (!node) return;
    node.classList.remove('magnitude-tone', 'low', 'mid', 'high');
    if (!event || !Number.isFinite(Number(event.magnitude))) return;
    node.classList.add('magnitude-tone', severityClass(event));
  }

  function setSeverityTone(id, event) {
    const node = $(id);
    if (!node) return;
    node.classList.remove('low', 'mid', 'high');
    if (!event || !Number.isFinite(Number(event.magnitude))) return;
    node.classList.add(severityClass(event));
  }

  function setIntensityTone(id, intensity) {
    const node = $(id);
    if (!node) return;
    if (!intensity) {
      node.style.background = '';
      node.style.color = '';
      node.style.borderColor = '';
      return;
    }
    node.style.background = 'transparent';
    node.style.color = '';
    node.style.borderColor = 'transparent';
  }

  function actionText(event, localIntensity) {
    const magnitude = Number(event && event.magnitude);
    if (event.isHistory) return '历史记录仅用于查看，不触发警报。';
    if (magnitude >= 4.5) return '请立即远离玻璃、悬挂物和危险结构，优先保护头部并就近避险。';
    if (magnitude >= 3) return '请注意周围环境，远离易坠落物，保持通讯畅通。';
    return localIntensity.level ? '本地影响较弱，继续保持监控。' : '继续监控当前区域地震信息。';
  }

  function eventIntensityText(event) {
    return formatIntensitySummary(event, hasUserLocation() ? state.userLocation : null);
  }

  function timeLine(event) {
    if (!event || !event.originTime) return event && event.sourceLabel || '历史';
    return formatTime(event.originTime);
  }

  function capturePositions(list) {
    const positions = new Map();
    list.querySelectorAll('[data-key]').forEach(node => positions.set(node.dataset.key, node.getBoundingClientRect().top));
    return positions;
  }

  function animateList(list, oldPositions) {
    list.querySelectorAll('[data-key]').forEach(node => {
      const oldTop = oldPositions.get(node.dataset.key);
      if (oldTop == null) return;
      const delta = oldTop - node.getBoundingClientRect().top;
      if (!delta) return;
      node.animate([
        { transform: `translateY(${delta}px)` },
        { transform: 'translateY(0)' }
      ], { duration: 260, easing: 'linear' });
    });
  }

  function refreshBrowserLocation() {
    if (hasUserLocation() && state.userLocation.source === 'browser') {
      centerMobileUserLocation('已使用当前定位');
      return;
    }
    if (!hasUserLocation()) {
      state.userLocation = { ...DEFAULT_LOCATION, place: '定位中', adminPlace: '定位中', source: 'pending' };
      renderHeader();
    }
    requestBrowserLocation(false, 0);
  }

  function getBrowserLocationOnce() {
    if (hasUserLocation() && state.userLocation.source === 'browser') return Promise.resolve(state.userLocation);
    if (state.browserLocationPromise) return state.browserLocationPromise;
    if (!navigator.geolocation) {
      state.browserLocationPromise = Promise.resolve(null);
      return state.browserLocationPromise;
    }
    const request = new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(position => {
        const lat = Number(position.coords.latitude);
        const lon = Number(position.coords.longitude);
        resolve(isUsableLocation(lat, lon) ? { lat, lon, place: '定位中', adminPlace: '定位中', source: 'browser' } : null);
      }, () => resolve(null), {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 300000
      });
    });
    state.browserLocationPromise = request;
    request.then(result => {
      if (!result && state.browserLocationPromise === request) state.browserLocationPromise = null;
    });
    return request;
  }

  function primeBrowserLocation() {
    if (state.autoLocationRequested || state.userLocation.source === 'url' || state.userLocation.source === 'browser') return;
    state.autoLocationRequested = true;
    setItem('quakeLocationAutoRequested', 'true');
    requestBrowserLocation(false, 0).catch(() => {});
  }

  async function requestBrowserLocation(centerAfter = false, focusRequestId = 0) {
    const browserLocation = await getBrowserLocationOnce();
    if (browserLocation) {
      state.userLocation = {
        ...browserLocation
      };
      setJson('quakeUserLocation', state.userLocation);
      renderHeader();
      refreshSelectedEventDisplay();
      sendFilter();
      if (!centerAfter) refreshHistory();
      updateMap(selectedEvent());
      resolveAdminLocation();
      if (centerAfter && focusRequestId === state.mapFocusRequestId) {
        centerMobileUserLocation('定位成功，已将您的位置移到地图中心');
      }
      return;
    }
    if (!hasUserLocation()) {
      if (!state.userContextPromise) state.userContextPromise = useIpLocationFallback(false, 0).catch(() => {});
      await state.userContextPromise;
    }
    if (centerAfter && focusRequestId === state.mapFocusRequestId && hasUserLocation()) {
      centerMobileUserLocation('未获得精确定位权限，已显示估算位置');
    } else if (centerAfter && focusRequestId === state.mapFocusRequestId) {
      showMobileMapNotice('无法获取您的位置，请检查浏览器定位权限');
    }
  }

  async function resolveAdminLocation() {
    if (!hasUserLocation()) return;
    const lat = Number(state.userLocation.lat);
    const lon = Number(state.userLocation.lon);
    try {
      const query = new URLSearchParams({ lat: String(lat), lon: String(lon) });
      const response = await fetch(`/reverse-location?${query}`, { cache: 'no-store' });
      const data = response.ok ? await response.json() : {};
      const place = standardizePlaceName(data.place);
      if (!place) return;
      state.userLocation = { ...state.userLocation, place, adminPlace: place };
      setJson('quakeUserLocation', state.userLocation);
      renderHeader();
      refreshSelectedEventDisplay();
      updateUserLocationMarker();
    } catch (_error) {
      // 定位反查失败时继续使用坐标计算。
    }
  }

  async function useIpLocationFallback(centerAfter = false, focusRequestId = 0) {
    const sourceAtStart = state.userLocation.source;
    try {
      const response = await fetch('/ip-location', { cache: 'no-store' });
      const data = response.ok ? await response.json() : {};
      const lat = Number(data.lat ?? data.latitude);
      const lon = Number(data.lon ?? data.longitude);
      if (state.userLocation.source === 'browser' && sourceAtStart !== 'browser') return;
      if (!isUsableLocation(lat, lon)) {
        markLocationUnavailable();
        return;
      }
      state.userLocation = {
        lat,
        lon,
        place: standardizePlaceName(data.place || data.city || '市政府位置'),
        adminPlace: standardizePlaceName(data.place || data.city || ''),
        source: 'ip'
      };
      setJson('quakeUserLocation', state.userLocation);
      renderHeader();
      refreshSelectedEventDisplay();
      sendFilter();
      refreshHistory();
      updateMap(selectedEvent());
      updateUserLocationMarker();
      resolveAdminLocation();
      if (centerAfter && focusRequestId === state.mapFocusRequestId) {
        centerMobileUserLocation('未获得精确定位权限，已显示估算位置');
      }
    } catch (_error) {
      markLocationUnavailable(centerAfter && focusRequestId === state.mapFocusRequestId);
    }
  }

  function markLocationUnavailable(showLocationError = false) {
    state.userLocation = { ...DEFAULT_LOCATION, place: '点击重新定位', adminPlace: '点击重新定位' };
    setJson('quakeUserLocation', state.userLocation);
    renderHeader();
    refreshSelectedEventDisplay();
    sendFilter();
    updateUserLocationMarker();
    if (showLocationError) showMobileMapNotice('无法获取您的位置，请检查浏览器定位权限');
  }

  function centerMobileUserLocation(message, immediate = false) {
    updateUserLocationMarker();
    if (!state.map || !hasUserLocation()) return;
    const latlng = [Number(state.userLocation.lat), Number(state.userLocation.lon)];
    const zoom = Math.max(state.map.getZoom(), 9);
    if (immediate) state.map.setView(latlng, zoom);
    else state.map.flyTo(latlng, zoom, { animate: true, duration: 0.35 });
    if (message) showMobileMapNotice(message);
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

  function openDrawer() {
    document.body.classList.add('drawer-open');
    $('mobile-settings-drawer')?.setAttribute('aria-hidden', 'false');
    $('mobile-menu-open')?.setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    document.body.classList.remove('drawer-open');
    $('mobile-settings-drawer')?.setAttribute('aria-hidden', 'true');
    $('mobile-menu-open')?.setAttribute('aria-expanded', 'false');
  }

  function applyBootstrapEvents() {
    const bootstrap = window.__QUAKE_BOOTSTRAP__;
    window.__QUAKE_BOOTSTRAP__ = null;
    if (bootstrap && Array.isArray(bootstrap.events)) {
      state.dataReady = true;
      upsertEvents(bootstrap.events, true, true);
    }
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    return { ...data, ok: Boolean(response.ok && data.ok), httpStatus: response.status };
  }

  function toggleDebugMode() {
    if (!state.debugEnabled) {
      openDebugDialog();
      return;
    }
    state.debugEnabled = false;
    updateDebugUi();
    showToast('调试模式已关闭');
  }

  function openDebugDialog() {
    const input = $('mobile-debug-password');
    if (input) input.value = '';
    $('mobile-debug-dialog')?.classList.add('show');
    window.setTimeout(() => input && input.focus(), 40);
  }

  function closeDebugDialog() {
    $('mobile-debug-dialog')?.classList.remove('show');
  }

  async function confirmDebugPassword() {
    const password = $('mobile-debug-password')?.value || '';
    if (!password) {
      showMessage('调试模式', '请输入调试密码。');
      return;
    }
    try {
      const data = await postJson('/debug/verify', { password });
      if (!data.ok) {
        showMessage('调试模式', '密码错误，请重新输入。');
        return;
      }
      state.debugEnabled = true;
      closeDebugDialog();
      closeDrawer();
      updateDebugUi();
      showToast('调试模式已开启');
    } catch (_error) {
      showMessage('调试模式', '暂时无法开启调试模式。');
    }
  }

  function updateDebugUi() {
    text('mobile-control-status', state.debugEnabled ? '调试模式开启' : '调试模式关闭');
    text('mobile-debug-enable', state.debugEnabled ? '退出调试' : '调试模式');
    $('mobile-debug-unlocked-actions')?.classList.toggle('is-hidden', !state.debugEnabled);
  }

  function mobilePushOptions() {
    return {
      threshold: state.notificationThreshold,
      area: mobileNotificationAreaPayload(),
      userLocation: state.userLocation,
      clientPath: '/mobile.html'
    };
  }

  function mobilePushErrorMessage(error) {
    if (window.QuakePush) return window.QuakePush.errorMessage(error);
    if (error && error.message) return error.message;
    return '设备推送失败，请检查 HTTPS、浏览器通知权限和设备网络。';
  }

  async function sendPushEventToCurrentDevice(event) {
    if (!event) throw new Error('当前没有可发送的地震信息。');
    if (!window.QuakePush) throw new Error('浏览器推送组件未加载，请强制刷新页面后重试。');
    const result = await window.QuakePush.sendEvent(event, mobilePushOptions());
    setMobileNotificationState(true);
    return result;
  }

  async function testMobileNotification() {
    if (!state.debugEnabled) return;
    const event = selectedEvent();
    if (!event) {
      showMessage('本机通知测试', '当前没有可发送的地震信息。');
      return;
    }
    try {
      const result = await sendPushEventToCurrentDevice(event);
      showMessage('本机通知测试', window.QuakePush.deliveryMessage(result));
    } catch (error) {
      showMessage('本机通知测试', mobilePushErrorMessage(error));
    }
  }

  async function addDebugEarthquakeEvent() {
    if (!state.debugEnabled) {
      openDebugDialog();
      return;
    }
    const city = faultCities[secureRandomInt(faultCities.length)];
    const magnitude = 3.2 + secureRandomInt(39) / 10;
    const now = new Date().toISOString();
    const testEvent = {
      source: 'debug',
      sourceLabel: '本地调试',
      eventId: `debug-${Date.now()}`,
      location: city.location,
      magnitude,
      depth: 8 + secureRandomInt(19),
      latitude: city.lat,
      longitude: city.lon,
      intensity: magnitude >= 5 ? 6 : magnitude >= 4 ? 4 : 3,
      originTime: now,
      receivedAt: now,
      isHistory: false,
      isLive: true,
      debugForceVisible: true
    };
    testEvent.eventKey = getEventKey(testEvent);
    state.selectedKey = testEvent.eventKey;
    upsertEvents([testEvent], false, true);
    try {
      await sendPushEventToCurrentDevice(testEvent);
      showToast('测试地震已添加，设备推送已发送');
    } catch (error) {
      showToast('测试地震已添加，设备推送失败');
      showMessage('测试地震推送', mobilePushErrorMessage(error));
    }
  }

  function secureRandomInt(maxExclusive) {
    const upperBound = Math.floor(Number(maxExclusive));
    if (!Number.isSafeInteger(upperBound) || upperBound <= 0 || upperBound > 0x100000000) return 0;
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') return Math.floor(upperBound / 2);
    const range = 0x100000000;
    const limit = range - range % upperBound;
    const values = new Uint32Array(1);
    do {
      window.crypto.getRandomValues(values);
    } while (values[0] >= limit);
    return values[0] % upperBound;
  }

  function showDebugCookieBar() {
    if (!state.debugEnabled) {
      openDebugDialog();
      return;
    }
    if (storage && storage.showCookieChoiceBar) storage.showCookieChoiceBar();
    else showToast('当前浏览器不支持 Cookie 设置面板');
  }

  function hasLocalGuideCookie() {
    return document.cookie.split(';').some(item => item.trim().startsWith(`${GUIDE_COOKIE}=`));
  }

  function writeEssentialCookie(name, value) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  }

  function maybeStartGuide() {
    if (hasLocalGuideCookie()) return;
    if (storage && storage.showCookieChoiceBar) storage.showCookieChoiceBar();
    const begin = () => window.setTimeout(() => {
      if (!hasLocalGuideCookie() && !document.getElementById('cookie-choice-bar')) startGuide(0);
    }, 220);
    if (document.getElementById('cookie-choice-bar')) {
      window.addEventListener('secure-storage-cookie-choice', begin, { once: true });
    } else {
      begin();
    }
  }

  function guideSteps() {
    return [
      { target: '.location-strip', title: '当前定位', text: '显示用于计算地震波到达时间和本地烈度的所在市区。' },
      { target: '.hero-alert', title: '最新地震', text: '显示当前选中地震的震中、震级、本地烈度、深度和预计到达。' },
      { target: '.map-card', title: '实时地图', text: '查看震中位置、关注地位置、地震波动画和地图源选择。' },
      { target: '.history-card', title: '历史地震', text: '显示服务器缓存和实时收到的最近 30 条地震，点击条目查看详情。' },
      { target: '#mobile-menu-open', title: '设置', text: '打开国家地区筛选、数据源状态、地图 token 和调试工具。' }
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
    window.setTimeout(() => renderGuideStep(target, steps), 180);
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

    const margin = 10;
    const gap = 10;
    bubble.style.visibility = 'hidden';
    bubble.style.right = 'auto';
    bubble.style.left = `${margin}px`;
    bubble.style.top = `${margin}px`;
    const box = bubble.getBoundingClientRect();
    const bubbleWidth = Math.min(box.width, viewportWidth - margin * 2);
    const bubbleHeight = Math.min(box.height, viewportHeight - margin * 2);
    const topSpace = Math.max(0, Math.min(viewportHeight, rect.top) - margin);
    const bottomSpace = Math.max(0, viewportHeight - Math.max(0, rect.bottom) - margin);
    const left = Math.max(margin, Math.min(viewportWidth - bubbleWidth - margin, (viewportWidth - bubbleWidth) / 2));
    const top = bottomSpace >= bubbleHeight + gap || bottomSpace >= topSpace
      ? Math.max(margin, Math.min(viewportHeight - bubbleHeight - margin, rect.bottom + gap))
      : Math.max(margin, Math.min(viewportHeight - bubbleHeight - margin, rect.top - bubbleHeight - gap));
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
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
    if (!guideOverlay) return;
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
      setItem('quakeGuideSeen', 'true');
    }
    window.removeEventListener('resize', refreshGuidePlacement);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', refreshGuidePlacement);
    if (guideResizeFrame) window.cancelAnimationFrame(guideResizeFrame);
    if (guideOverlay) guideOverlay.remove();
    guideOverlay = null;
    guideTarget = null;
    guideResizeFrame = 0;
  }

  function openDebugPasswordDialog() {
    closeDebugDialog();
    $('mobile-debug-password-dialog')?.classList.add('show');
  }

  function closeDebugPasswordDialog() {
    $('mobile-debug-password-dialog')?.classList.remove('show');
    openDebugDialog();
  }

  async function changeDebugPassword() {
    const oldPassword = $('mobile-debug-old-password')?.value || '';
    const newPassword = $('mobile-debug-new-password')?.value || '';
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
      const data = await postJson('/debug/change-password', { oldPassword, newPassword });
      if (!data.ok) {
        showMessage('修改密码', data.message || '原密码不正确。');
        return;
      }
      if ($('mobile-debug-old-password')) $('mobile-debug-old-password').value = '';
      if ($('mobile-debug-new-password')) $('mobile-debug-new-password').value = '';
      $('mobile-debug-password-dialog')?.classList.remove('show');
      showMessage('修改密码', '调试密码已更新。');
    } catch (_error) {
      showMessage('修改密码', '暂时无法修改调试密码。');
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

  function showMessage(title, message) {
    text('mobile-message-title', title);
    text('mobile-message-text', message);
    $('mobile-message-dialog')?.classList.add('show');
  }

  function showToast(message) {
    const toast = $('mobile-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('is-hidden');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.add('is-hidden'), 2600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
