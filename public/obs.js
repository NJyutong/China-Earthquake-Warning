(function () {
  const {
    ALL_SOURCES,
    MAP_SOURCES,
    standardizePlaceName,
    getEventKey,
    isRealEarthquake,
    estimateWaveCountdowns,
    estimateLocalIntensity,
    intensityColor,
    magnitudeIntensity,
    formatNumber,
    formatCoordinatePair,
    wavePixelSize,
    formatTime,
    formatTimeWithZone,
    formatCountdown
  } = window.EarthquakeShared;

  const state = {
    events: [],
    sources: new Map(),
    ws: null,
    reconnectDelay: 1000,
    map: null,
    marker: null,
    circle: null,
    mapConfig: {},
    mapLoadId: 0,
    mapHasLoaded: false,
    mapToken: '',
    mapSourceKey: readMapSource(),
    activeMapSource: '',
    lastUsableMapSource: '',
    geoCountryCode: '',
    geoRegionName: '',
    theme: readTheme(),
    themeMode: readThemeMode(),
    dataStatus: 'connecting',
    serverConnectionState: 'connecting',
    userLocation: readUserLocation()
  };
  let themeTransitionTimer = null;

  const $ = id => document.getElementById(id);
  const CACHE_KEY = 'quakeRecentEvents';
  const storage = window.SecureStorage;

  async function secureGet(key, fallback = '') {
    try {
      const value = storage ? await storage.getItem(key) : null;
      return value === null || value === undefined ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function secureRemove(key) {
    if (storage) storage.removeItem(key);
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
    const key = params.get('map') || 'amap';
    return MAP_SOURCES.some(source => source.key === key) ? key : 'amap';
  }

  async function loadPrivateSettings() {
    if (storage && storage.ready) await storage.ready;
    const params = new URLSearchParams(window.location.search);
    const urlTheme = params.get('theme');
    if (urlTheme === 'dark' || urlTheme === 'light') {
      state.themeMode = urlTheme;
      state.theme = urlTheme;
    } else {
      const storedThemeMode = await secureGet('quakeThemeMode', 'system');
      state.themeMode = ['system', 'dark', 'light'].includes(storedThemeMode) ? storedThemeMode : 'system';
      state.theme = resolveThemeMode(state.themeMode);
    }
    if (!params.get('map')) state.mapSourceKey = await secureGet('quakeMapSource', state.mapSourceKey);
    state.mapToken = params.get('tk') || params.get('tiandituToken') || await secureGet('tiandituToken', '');
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

  function isUsableLocation(lat, lon) {
    const latitude = Number(lat);
    const longitude = Number(lon);
    return Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180 &&
      !(latitude === 0 && longitude === 0);
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value === undefined || value === null || value === '' ? '--' : String(value);
  }

  function setHtml(id, value) {
    const node = $(id);
    if (node) node.innerHTML = value === undefined || value === null || value === '' ? '--' : String(value);
  }

  function setDataStatus(status) {
    state.dataStatus = ['connecting', 'ready', 'error'].includes(status) ? status : 'connecting';
    if (document.body) document.body.dataset.dataState = state.dataStatus;
  }

  function wsUrl() {
    return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
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
    if (state.mapSourceKey === 'yandex' && serverConfig.yandexQuotaExhausted) {
      state.mapSourceKey = 'google';
    }
    state.mapToken =
      params.get('tk') ||
      params.get('tiandituToken') ||
      state.mapToken ||
      serverConfig.tiandituToken ||
      '';
    const geoInfo = await detectGeoInfo();
    state.geoCountryCode = geoInfo.countryCode;
    state.geoRegionName = geoInfo.region;
    if (!isUsableLocation(state.userLocation.lat, state.userLocation.lon)) {
      if (isUsableLocation(geoInfo.lat, geoInfo.lon)) {
        state.userLocation = {
          lat: geoInfo.lat,
          lon: geoInfo.lon,
          place: [geoInfo.city, geoInfo.region, geoInfo.countryName].filter(Boolean).join(' ') || '本地位置',
          source: 'network'
        };
      }
    }
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
        lat: Number(data.lat ?? data.latitude),
        lon: Number(data.lon ?? data.longitude)
      };
    } catch (_error) {
      return { countryCode: '', countryName: '', region: '', city: '', lat: NaN, lon: NaN };
    } finally {
      clearTimeout(timer);
    }
  }

  async function initMap() {
    setText('map-hint', '地图加载中');
    if (!window.OfficialMap || typeof window.OfficialMap.create !== 'function') {
      setText('map-hint', '地图适配器未加载，请刷新页面重试');
      return;
    }
    await renderOfficialMapLayer();
  }

  async function renderOfficialMapLayer() {
    const loadId = ++state.mapLoadId;
    let requested = state.mapSourceKey || 'auto';
    const options = {
      config: state.mapConfig,
      token: state.mapToken,
      countryCode: state.geoCountryCode
    };
    if (requested === 'yandex' && state.mapConfig.yandexQuotaExhausted) requested = 'google';
    const availability = window.OfficialMap.availability(requested, options);
    if (requested !== 'auto' && !availability.available) {
      setText('map-hint', requested === 'tianditu' ? '请输入天地图 token' : availability.reason);
      return;
    }
    const candidates = window.OfficialMap.candidates(requested, options);
    if (!candidates.length) {
      setText('map-hint', '暂无可用地图源');
      return;
    }
    const latest = state.events[0];
    const center = latest && Number.isFinite(Number(latest.latitude)) && Number.isFinite(Number(latest.longitude))
      ? [Number(latest.latitude), Number(latest.longitude)]
      : [35.8, 104.2];
    const zoom = latest && Number(latest.magnitude) >= 5 ? 6 : latest ? 5 : 4;
    destroyCurrentMap();
    let lastError = '';
    for (const sourceKey of candidates) {
      const label = window.OfficialMap.labels[sourceKey] || sourceKey;
      setText('map-hint', `正在加载${label}官方地图`);
      try {
        const map = await window.OfficialMap.create(sourceKey, 'map', { ...options, center, zoom });
        if (loadId !== state.mapLoadId) {
          map.destroy();
          return;
        }
        state.map = map;
        state.activeMapSource = sourceKey;
        state.lastUsableMapSource = sourceKey;
        state.mapHasLoaded = true;
        setText('map-hint', label);
        if (latest) updateMapEpicenter(latest);
        return;
      } catch (error) {
        if (error && error.code === 'quota_exhausted' && error.fallback === 'google') {
          state.mapSourceKey = 'google';
          state.mapConfig.yandexQuotaExhausted = true;
          return renderOfficialMapLayer();
        }
        lastError = String(error && error.message || '地图加载失败');
        if (requested !== 'auto') break;
      }
    }
    if (loadId === state.mapLoadId) {
      state.mapHasLoaded = false;
      setText('map-hint', lastError || '地图服务暂时不可用');
    }
  }

  function destroyCurrentMap() {
    clearMapEpicenter();
    if (state.map && typeof state.map.destroy === 'function') state.map.destroy();
    state.map = null;
    state.mapHasLoaded = false;
  }

  function connect() {
    if (state.ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.ws.readyState)) return;
    const ws = new WebSocket(wsUrl());
    state.ws = ws;

    ws.onopen = () => {
      state.reconnectDelay = 1000;
      state.serverConnectionState = 'connected';
    };

    ws.onmessage = message => {
      let payload;
      try {
        payload = JSON.parse(message.data);
      } catch (_error) {
        renderSourceStatus();
        return;
      }
      if (payload.type === 'hello') {
        setDataStatus('ready');
        (Array.isArray(payload.sources) ? payload.sources : []).forEach(source => {
          if (source && source.key) state.sources.set(String(source.key).slice(0, 64), source);
        });
        (Array.isArray(payload.events) ? payload.events : []).slice().reverse().forEach(event => upsertEvent(event));
        renderSourceStatus();
        return;
      }
      if (payload.type === 'history') {
        setDataStatus('ready');
        (Array.isArray(payload.events) ? payload.events : []).slice().reverse().forEach(event => upsertEvent(event));
        return;
      }
      if (payload.type === 'source_status' && payload.source && payload.source.key) {
        state.sources.set(payload.source.key, payload.source);
        renderSourceStatus();
        return;
      }
      if (payload.type === 'event') upsertEvent(payload.event);
    };

    ws.onclose = () => {
      state.serverConnectionState = 'disconnected';
      state.ws = null;
      loadServerSnapshot();
      setTimeout(connect, state.reconnectDelay);
      state.reconnectDelay = Math.min(15000, state.reconnectDelay * 1.6);
    };

    ws.onerror = () => {
      state.serverConnectionState = 'disconnected';
      renderSourceStatus();
    };
  }

  async function loadServerSnapshot() {
    const [sourcesResult, historyResult] = await Promise.allSettled([
      fetch('/sources', { cache: 'no-store' }).then(response => response.ok ? response.json() : {}),
      fetch('/history?country=CN_MAINLAND&region=all&limit=30', { cache: 'no-store' })
        .then(response => response.ok ? response.json() : {})
    ]);
    if (sourcesResult.status === 'fulfilled') {
      const sources = Array.isArray(sourcesResult.value.sources) ? sourcesResult.value.sources : [];
      sources.forEach(source => {
        if (source && source.key) state.sources.set(String(source.key).slice(0, 64), source);
      });
      renderSourceStatus();
    }
    if (historyResult.status === 'fulfilled') {
      setDataStatus('ready');
      const events = Array.isArray(historyResult.value.events) ? historyResult.value.events : [];
      events.slice().reverse().forEach(event => upsertEvent({ ...event, isHistory: true, isLive: false }));
      renderLatestEvent();
      renderEventList();
    } else if (!state.events.length && state.dataStatus !== 'ready') {
      setDataStatus('error');
      renderLatestEvent();
      renderEventList();
    }
  }

  function upsertEvent(event) {
    if (!event || !isRealEarthquake(event)) return;
    setDataStatus('ready');
    const eventKey = event.eventKey || getEventKey(event);
    const next = { ...event, eventKey };
    const index = state.events.findIndex(item => item.eventKey === eventKey);
    if (index >= 0) {
      state.events[index] = { ...state.events[index], ...next };
    } else {
      state.events.unshift(next);
      state.events = state.events.slice(0, 30);
    }
    renderLatestEvent();
    renderEventList();
    updateMapEpicenter(state.events[0]);
    saveCachedEvents();
  }

  function updateMapEpicenter(event) {
    if (!event || !Number.isFinite(Number(event.latitude)) || !Number.isFinite(Number(event.longitude))) {
      clearMapEpicenter();
      setText('map-hint', event ? '当前事件缺少震中坐标' : '等待地震事件');
      return;
    }
    if (!state.map || !window.OfficialMap) return;
    const latlng = [Number(event.latitude), Number(event.longitude)];
    const magnitude = Number(event.magnitude) || 3;
    const intensity = intensityColor(eventIntensity(event));
    const waveSize = wavePixelSize(event.depth);
    const markerHtml = `
      <i class="wave-ring" style="--wave-size:${waveSize}px" aria-hidden="true"></i>
      <b>${formatNumber(event.magnitude, '级', 1)}</b>
      <em style="background:${intensity.background};color:${intensity.color};border-color:${intensity.border}">
        ${intensity.level ? `烈度 ${intensity.level}` : '烈度 --'}
      </em>
    `;
    const icon = window.OfficialMap.divIcon({
      className: 'quake-marker',
      html: markerHtml,
      iconSize: [waveSize, waveSize],
      iconAnchor: [waveSize / 2, waveSize / 2]
    });
    if (!state.marker) {
      state.marker = window.OfficialMap.marker(latlng, { icon, interactive: false }).addTo(state.map);
    } else {
      state.marker.setLatLng(latlng);
      state.marker.setIcon(icon);
    }
    state.map.flyTo(latlng, magnitude >= 5 ? 6 : 5, { animate: true, duration: 0.8 });
    setText('map-hint', `${displayLocation(event)} · ${formatNumber(event.magnitude, ' 级', 1)}`);
  }

  function renderLatestEvent() {
    const event = state.events[0];
    if (!event) {
      const connecting = state.dataStatus === 'connecting';
      const failed = state.dataStatus === 'error';
      document.body.dataset.quakeState = connecting ? 'connecting' : failed ? 'error' : 'empty';
      setText('latest-source', connecting ? '正在连接服务器中' : failed ? '连接异常' : '等待数据');
      setText('latest-source-detail', '--');
      setText('latest-location', connecting ? '等待服务器返回地震数据' : failed ? '暂时无法获取地震数据' : '暂无地震事件');
      setText('latest-magnitude', '-- 级');
      setHtml('latest-countdown', '--');
      setText('latest-depth', '--');
      setText('latest-coords', '--');
      setText('latest-origin', '--');
      setText('latest-received', '--');
      applyIntensity('');
      return;
    }
    const waves = estimateWaveCountdowns(event, state.userLocation);
    document.body.dataset.quakeState = event.isHistory
      ? 'history'
      : [waves.p, waves.s].some(value => Number.isFinite(Number(value)) && Number(value) > 0)
        ? 'warning'
        : 'arrived';
    setText('latest-source', event.sourceLabel || event.source);
    setText('latest-source-detail', event.sourceLabel || event.source);
    setText('latest-location', displayLocation(event));
    setText('latest-magnitude', formatNumber(event.magnitude, ' 级', 1));
    setHtml('latest-countdown', waveCountdownHtml(waves, event));
    setText('latest-depth', formatNumber(event.depth, ' km', 0));
    setText('latest-coords', coordinateText(event));
    setText('latest-origin', formatTimeWithZone(event.originTime));
    setText('latest-received', formatTimeWithZone(event.receivedAt));
    applyIntensity(eventIntensity(event));
  }

  function waveCountdownHtml(waves, event) {
    const expiredLabel = event && event.isHistory ? '已结束' : '已到达';
    return `
      <span><b>纵波(P)</b><em>${formatCountdown(waves.p, expiredLabel)}</em></span>
      <span><b>横波(S)</b><em>${formatCountdown(waves.s, expiredLabel)}</em></span>
    `;
  }

  function displayLocation(event) {
    return standardizePlaceName(event && event.location) || '未知震中';
  }

  function coordinateText(event) {
    return formatCoordinatePair(event.latitude, event.longitude, 3);
  }

  function applyIntensity(intensity) {
    const badge = $('latest-intensity');
    if (!badge) return;
    const color = intensityColor(intensity);
    badge.textContent = color.label;
    badge.style.background = color.background;
    badge.style.color = color.color;
    badge.style.borderColor = color.border;
  }

  function applyObsDisplayMode() {
    const params = new URLSearchParams(window.location.search);
    const transparent = ['1', 'true', 'yes'].includes(String(params.get('transparent') || '').toLowerCase());
    document.body.classList.toggle('obs-transparent', transparent);
  }

  function clearMapEpicenter() {
    if (state.marker) {
      state.marker.remove();
      state.marker = null;
    }
    if (state.circle) {
      state.circle.remove();
      state.circle = null;
    }
  }

  function eventIntensity(event) {
    return estimateLocalIntensity(event, state.userLocation);
  }

  function renderEventList() {
    const list = $('event-list');
    if (!list) return;
    const oldPositions = captureListPositions(list, 'article[data-key]', 'key');
    const listReady = list.dataset.ready === 'true';
    if (!state.events.length) {
      const message = state.dataStatus === 'connecting'
        ? '正在连接服务器中'
        : state.dataStatus === 'error'
          ? '数据接口暂时不可用，正在等待实时通道恢复。'
          : '暂无真实地震事件，等待历史或实时数据接入。';
      const empty = document.createElement('article');
      empty.setAttribute('role', 'status');
      empty.textContent = message;
      list.replaceChildren(empty);
      list.dataset.ready = String(state.dataStatus !== 'connecting');
      return;
    }
    const fragment = document.createDocumentFragment();
    state.events.slice(0, 5).forEach(event => {
      const key = event.eventKey || getEventKey(event);
      const isNew = listReady && !oldPositions.has(key);
      const article = document.createElement('article');
      article.className = `mag-${magnitudeBand(event.magnitude)}${isNew ? ' is-new' : ''}`;
      article.dataset.key = key;
      const title = document.createElement('strong');
      title.textContent = `${displayLocation(event)} · ${formatNumber(event.magnitude, ' 级', 1)}`;
      const meta = document.createElement('span');
      meta.textContent = `${event.sourceLabel || event.source} · ${formatTime(event.originTime || event.receivedAt)} · ${event.isLive ? '实时' : '历史'}`;
      article.append(title, meta);
      fragment.appendChild(article);
    });
    list.replaceChildren(fragment);
    list.dataset.ready = 'true';
    animateListMoves(list, 'article[data-key]', 'key', oldPositions);
  }

  function magnitudeBand(magnitude) {
    const value = Number(magnitude);
    if (!Number.isFinite(value)) return 'low';
    if (value >= 5) return 'high';
    if (value >= 4) return 'mid';
    return 'low';
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
    if (!oldPositions.size) return;
    requestAnimationFrame(() => {
      list.querySelectorAll(selector).forEach(item => {
        const key = item.dataset[keyName];
        if (!key || !oldPositions.has(key)) return;
        const delta = oldPositions.get(key) - item.getBoundingClientRect().top;
        if (Math.abs(delta) < 1) return;
        item.style.transition = 'transform 0ms linear';
        item.style.transform = `translateY(${delta}px)`;
        requestAnimationFrame(() => {
          item.style.transition = 'transform 220ms linear, border-color 160ms linear, background-color 160ms linear';
          item.style.transform = '';
        });
      });
    });
  }

  function renderSourceStatus() {
    const list = $('source-status-list');
    if (!list) return;
    list.innerHTML = ALL_SOURCES.map(source => {
      const item = state.sources.get(source.key) || { label: source.label, status: 'closed' };
      const status = ['connected', 'connecting', 'reconnecting', 'error', 'closed'].includes(item.status) ? item.status : 'closed';
      return `<span class="source-chip"><i class="status-dot status-${escapeAttr(status)}"></i>${escapeHtml(source.label)}</span>`;
    }).join('');
  }

  function updateClock() {
    setText('current-time', formatTime(new Date()));
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

  function loadCachedEvents() {
    secureRemove(CACHE_KEY);
    return [];
  }

  function saveCachedEvents() {
    secureRemove(CACHE_KEY);
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    const datasetTheme = theme === 'dark' ? 'dark' : 'light';
    if (root.dataset.theme !== datasetTheme) {
      root.classList.add('theme-transitioning');
      clearTimeout(themeTransitionTimer);
      themeTransitionTimer = setTimeout(() => root.classList.remove('theme-transitioning'), 180);
    }
    root.dataset.theme = datasetTheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', datasetTheme === 'light' ? '#f4f7fb' : '#07111f');
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

  async function start() {
    applyObsDisplayMode();
    await loadPrivateSettings();
    applyTheme(state.theme);
    initAutoTheme();
    applyBootstrapEvents();
    await loadConfig();
    await initMap();
    loadCachedEvents().slice().reverse().forEach(event => upsertEvent({ ...event, isHistory: true, isLive: false }));
    renderSourceStatus();
    renderLatestEvent();
    updateClock();
    connect();
    loadServerSnapshot();
    setInterval(updateClock, 1000);
    setInterval(renderLatestEvent, 1000);
    setInterval(loadServerSnapshot, 60000);
  }

  function applyBootstrapEvents() {
    const bootstrap = window.__QUAKE_BOOTSTRAP__;
    const events = bootstrap && Array.isArray(bootstrap.events) ? bootstrap.events : [];
    window.__QUAKE_BOOTSTRAP__ = null;
    if (events.length) setDataStatus('ready');
    events.slice().reverse().forEach(event => upsertEvent({ ...event, isHistory: true, isLive: false }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  window.addEventListener('pagehide', () => secureRemove(CACHE_KEY));
})();
