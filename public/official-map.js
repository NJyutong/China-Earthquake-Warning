(function () {
  'use strict';

  const DEFAULT_CENTER = [35.8, 104.2];
  const DEFAULT_ZOOM = 4;
  const SDK_TIMEOUT_MS = 15000;
  const PROVIDER_LABELS = {
    amap: '高德地图',
    tianditu: '天地图',
    google: 'Google Maps',
    yandex: 'Yandex Maps',
    esri: 'Esri ArcGIS',
    osm: 'OpenStreetMap'
  };
  const PROVIDER_ORIGINS = {
    amap: ['https://webapi.amap.com'],
    tianditu: ['https://api.tianditu.gov.cn'],
    google: ['https://maps.googleapis.com', 'https://www.google.com'],
    yandex: ['https://api-maps.yandex.ru'],
    esri: ['https://js.arcgis.com', 'https://services.arcgisonline.com'],
    osm: ['https://tile.openstreetmap.org']
  };
  const sdkPromises = new Map();
  let configPromise = null;

  function clientConfig() {
    if (window.__QUAKE_CONFIG__) return Promise.resolve(window.__QUAKE_CONFIG__);
    if (!configPromise) {
      configPromise = fetch('/config', { cache: 'no-store', credentials: 'same-origin' })
        .then(response => response.ok ? response.json() : {})
        .catch(() => ({}));
    }
    return configPromise;
  }

  function providerAvailability(key, options = {}) {
    const config = options.config || window.__QUAKE_CONFIG__ || {};
    const token = String(options.token || config.tiandituToken || '').trim();
    if (key === 'auto') return { available: true, reason: '' };
    if (key === 'amap') {
      return config.amapJsKey || window.AMap
        ? { available: true, reason: '' }
        : { available: false, reason: '未配置 AMAP_JS_KEY' };
    }
    if (key === 'tianditu') {
      return token
        ? { available: true, reason: '' }
        : { available: false, reason: '需要天地图 token' };
    }
    if (key === 'google') {
      return config.googleMapsJsKey
        ? { available: true, reason: '' }
        : { available: true, embedMode: true, reason: '使用 Google Maps 分享嵌入模式' };
    }
    if (key === 'yandex') {
      if (!config.yandexConfigured) {
        return { available: false, reason: '未配置 YANDEX_MAPS_API_KEY' };
      }
      if (config.yandexQuotaExhausted) {
        return { available: false, reason: '今日 100 次额度已用完' };
      }
      return config.yandexMapsAvailable
        ? { available: true, reason: '' }
        : { available: false, reason: 'Yandex 地图暂不可用' };
    }
    if (key === 'esri' || key === 'osm') return { available: true, reason: '' };
    return { available: false, reason: '未知地图源' };
  }

  function providerCandidates(requested, options = {}) {
    if (requested && requested !== 'auto') {
      const availability = providerAvailability(requested, options);
      return availability.available && !availability.externalOnly ? [requested] : [];
    }
    const countryCode = String(options.countryCode || '').toUpperCase();
    const preferred = countryCode === 'CN'
      ? ['amap', 'tianditu', 'esri', 'osm']
      : countryCode === 'RU'
        ? ['yandex', 'google', 'esri', 'osm']
        : ['esri', 'google', 'osm'];
    return preferred.filter(key => {
      const availability = providerAvailability(key, options);
      return availability.available && !availability.externalOnly;
    });
  }

  function warmProviderConnection(key) {
    for (const origin of PROVIDER_ORIGINS[key] || []) {
      const existing = Array.from(document.head.querySelectorAll('link[data-quake-preconnect]'))
        .some(link => link.href === origin + '/');
      if (existing) continue;
      const preconnect = document.createElement('link');
      preconnect.rel = 'preconnect';
      preconnect.href = origin;
      preconnect.crossOrigin = 'anonymous';
      preconnect.dataset.quakePreconnect = key;
      const dns = document.createElement('link');
      dns.rel = 'dns-prefetch';
      dns.href = origin;
      dns.dataset.quakePreconnect = key;
      document.head.append(preconnect, dns);
    }
  }

  function prepareProvider(requested, options = {}) {
    const config = options.config || window.__QUAKE_CONFIG__ || {};
    const candidates = providerCandidates(requested, { ...options, config });
    const key = candidates[0];
    if (!key) return Promise.resolve('');
    warmProviderConnection(key);
    if (key === 'amap') return loadAmap(config).then(() => key);
    if (key === 'tianditu') {
      const token = String(options.token || config.tiandituToken || '').trim();
      return loadTianditu(token).then(() => key);
    }
    if (key === 'google') {
      return config.googleMapsJsKey ? loadGoogle(config.googleMapsJsKey).then(() => key) : Promise.resolve(key);
    }
    if (key === 'yandex') return loadYandex().then(() => key);
    if (key === 'esri') return loadEsri().then(() => key);
    if (key === 'osm') return loadOpenLayers().then(() => key);
    return Promise.resolve(key);
  }

  async function createProviderMap(key, containerId, options = {}) {
    const config = options.config || await clientConfig();
    const availability = providerAvailability(key, { ...options, config });
    if (!availability.available) throw new Error(availability.reason);
    warmProviderConnection(key);
    const parts = prepareContainer(containerId, key);
    const createOptions = {
      ...options,
      config,
      center: normalizeLatLng(options.center) || DEFAULT_CENTER,
      zoom: clampZoom(options.zoom, DEFAULT_ZOOM)
    };
    try {
      if (key === 'amap') return await createAmap(parts, createOptions);
      if (key === 'tianditu') return await createTianditu(parts, createOptions);
      if (key === 'google') return await createGoogle(parts, createOptions);
      if (key === 'yandex') return await createYandex(parts, createOptions);
      if (key === 'esri') return await createEsri(parts, createOptions);
      if (key === 'osm') return await createOsm(parts, createOptions);
      throw new Error('未知地图源');
    } catch (error) {
      parts.root.replaceChildren();
      const detail = safeErrorMessage(error);
      const wrapped = new Error((PROVIDER_LABELS[key] || key) + '加载失败' + (detail ? '：' + detail : ''));
      wrapped.code = error && error.code || '';
      wrapped.fallback = error && error.fallback || '';
      throw wrapped;
    }
  }

  function prepareContainer(containerId, key) {
    const root = document.getElementById(containerId);
    if (!root) throw new Error('地图容器不存在');
    root.replaceChildren();
    root.dataset.provider = key;
    delete root.dataset.embedMode;
    const canvas = document.createElement('div');
    canvas.className = 'provider-map-canvas provider-map-' + key;
    canvas.id = 'provider-map-' + key + '-' + window.crypto.randomUUID();
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', (PROVIDER_LABELS[key] || key) + '交互地图');
    const overlays = document.createElement('div');
    overlays.className = 'provider-map-overlays';
    overlays.setAttribute('aria-hidden', 'true');
    root.append(canvas, overlays);
    return { root, canvas, overlays };
  }

  class BaseMapAdapter {
    constructor(parts, provider) {
      this.root = parts.root;
      this.canvas = parts.canvas;
      this.overlayRoot = parts.overlays;
      this.provider = provider;
      this.listeners = new Map();
      this.markers = new Set();
      this.cleanups = [];
      this.destroyed = false;
      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => this.emit('resize'));
        this.resizeObserver.observe(this.root);
      }
    }

    on(names, handler) {
      if (typeof handler !== 'function') return this;
      for (const name of splitEventNames(names)) {
        if (!this.listeners.has(name)) this.listeners.set(name, new Set());
        this.listeners.get(name).add(handler);
      }
      return this;
    }

    off(names, handler) {
      const wanted = splitEventNames(names);
      const keys = wanted.length ? wanted : Array.from(this.listeners.keys());
      for (const name of keys) {
        const handlers = this.listeners.get(name);
        if (!handlers) continue;
        if (handler) handlers.delete(handler);
        else handlers.clear();
        if (!handlers.size) this.listeners.delete(name);
      }
      return this;
    }

    emit(name) {
      for (const handler of this.listeners.get(name) || []) {
        try {
          handler();
        } catch (_error) {
          // A single overlay listener must not break the map engine.
        }
      }
    }

    track(cleanup) {
      if (typeof cleanup === 'function') this.cleanups.push(cleanup);
      return cleanup;
    }

    getCenter() {
      return DEFAULT_CENTER.slice();
    }

    getZoom() {
      return DEFAULT_ZOOM;
    }

    setView(_latlng, _zoom) {
      return this;
    }

    flyTo(latlng, zoom) {
      return this.setView(latlng, zoom);
    }

    fitBounds(bounds, options = {}) {
      const view = boundsView(bounds, this.canvas, options.padding);
      return view ? this.flyTo(view.center, view.zoom) : this;
    }

    latLngToContainerPoint(latlng) {
      return projectWebMercator(latlng, this.getCenter(), this.getZoom(), this.canvas);
    }

    invalidateSize() {
      this.emit('resize');
      return this;
    }

    addMarker(marker) {
      this.markers.add(marker);
    }

    removeMarker(marker) {
      this.markers.delete(marker);
    }

    destroyNative() {}

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      for (const marker of Array.from(this.markers)) marker.remove();
      for (const cleanup of this.cleanups.splice(0).reverse()) {
        try {
          cleanup();
        } catch (_error) {
          // Provider cleanup is best effort.
        }
      }
      if (this.resizeObserver) this.resizeObserver.disconnect();
      this.listeners.clear();
      this.destroyNative();
      this.root.replaceChildren();
    }
  }

  class OverlayMarker {
    constructor(latlng, options = {}) {
      this.latlng = normalizeLatLng(latlng) || DEFAULT_CENTER;
      this.options = options;
      this.icon = options.icon || divIcon();
      this.map = null;
      this.element = null;
      this.popup = null;
      this.popupHtml = '';
      this.update = this.update.bind(this);
    }

    addTo(map) {
      if (!map || !map.overlayRoot) return this;
      this.remove();
      this.map = map;
      this.element = document.createElement('div');
      this.element.addEventListener('click', () => this.togglePopup());
      this.map.overlayRoot.appendChild(this.element);
      this.map.addMarker(this);
      this.map.on('move zoom moveend zoomend resize', this.update);
      window.addEventListener('resize', this.update);
      this.setIcon(this.icon);
      this.update();
      return this;
    }

    setLatLng(latlng) {
      this.latlng = normalizeLatLng(latlng) || this.latlng;
      this.update();
      return this;
    }

    setIcon(icon) {
      this.icon = icon || divIcon();
      if (!this.element) return this;
      const className = String(this.icon.className || '').replace(/[^a-zA-Z0-9 _-]/g, '');
      this.element.className = ('provider-map-marker ' + className).trim();
      this.element.innerHTML = this.icon.html || '';
      const size = this.icon.iconSize || [1, 1];
      this.element.style.width = Math.max(1, Number(size[0]) || 1) + 'px';
      this.element.style.height = Math.max(1, Number(size[1]) || 1) + 'px';
      this.element.style.pointerEvents = this.options.interactive === false ? 'none' : 'auto';
      this.update();
      return this;
    }

    bindPopup(html) {
      this.popupHtml = String(html || '');
      return this;
    }

    togglePopup() {
      if (!this.map || !this.popupHtml || this.options.interactive === false) return;
      if (this.popup) {
        this.popup.remove();
        this.popup = null;
        return;
      }
      this.popup = document.createElement('div');
      this.popup.className = 'provider-map-popup';
      this.popup.innerHTML = this.popupHtml;
      this.popup.setAttribute('role', 'dialog');
      this.map.overlayRoot.appendChild(this.popup);
      this.update();
    }

    update() {
      if (!this.map || !this.element) return;
      const point = this.map.latLngToContainerPoint(this.latlng);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        this.element.hidden = true;
        if (this.popup) this.popup.hidden = true;
        return;
      }
      const anchor = this.icon.iconAnchor || [0, 0];
      this.element.hidden = false;
      this.element.style.transform = 'translate3d(' +
        (point.x - Number(anchor[0] || 0)) + 'px,' +
        (point.y - Number(anchor[1] || 0)) + 'px,0)';
      if (this.popup) {
        this.popup.hidden = false;
        this.popup.style.transform = 'translate3d(' + (point.x + 12) + 'px,' + (point.y - 12) + 'px,0)';
      }
    }

    remove() {
      if (this.map) {
        this.map.off('move zoom moveend zoomend resize', this.update);
        this.map.removeMarker(this);
      }
      window.removeEventListener('resize', this.update);
      if (this.element) this.element.remove();
      if (this.popup) this.popup.remove();
      this.element = null;
      this.popup = null;
      this.map = null;
    }
  }

  class AmapAdapter extends BaseMapAdapter {
    constructor(parts, nativeMap, AMap) {
      super(parts, 'amap');
      this.nativeMap = nativeMap;
      this.AMap = AMap;
      this.bind('mapmove', 'move');
      this.bind('moveend', 'moveend');
      this.bind('zoomchange', 'zoom');
      this.bind('zoomend', 'zoomend');
      this.bind('complete', 'complete');
    }

    bind(nativeName, name) {
      const handler = () => this.emit(name);
      this.nativeMap.on(nativeName, handler);
      this.track(() => this.nativeMap.off(nativeName, handler));
    }

    setView(latlng, zoom = this.getZoom()) {
      const point = normalizeLatLng(latlng);
      if (point) this.nativeMap.setZoomAndCenter(clampZoom(zoom, this.getZoom()), new this.AMap.LngLat(point[1], point[0]));
      return this;
    }

    getCenter() {
      const center = this.nativeMap.getCenter();
      return center ? [Number(center.getLat()), Number(center.getLng())] : DEFAULT_CENTER.slice();
    }

    getZoom() {
      return Number(this.nativeMap.getZoom()) || DEFAULT_ZOOM;
    }

    fitBounds(bounds, options = {}) {
      const normalized = normalizeBounds(bounds);
      if (!normalized) return this;
      const bound = new this.AMap.Bounds(
        new this.AMap.LngLat(normalized.minLon, normalized.minLat),
        new this.AMap.LngLat(normalized.maxLon, normalized.maxLat)
      );
      this.nativeMap.setBounds(bound, false, normalizePadding(options.padding));
      return this;
    }

    latLngToContainerPoint(latlng) {
      const point = normalizeLatLng(latlng);
      if (!point) return null;
      const pixel = this.nativeMap.lngLatToContainer(new this.AMap.LngLat(point[1], point[0]));
      return pixel ? { x: Number(pixel.x), y: Number(pixel.y) } : null;
    }

    invalidateSize() {
      if (typeof this.nativeMap.resize === 'function') this.nativeMap.resize();
      return super.invalidateSize();
    }

    destroyNative() {
      if (this.nativeMap && typeof this.nativeMap.destroy === 'function') this.nativeMap.destroy();
    }
  }

  class TiandituAdapter extends BaseMapAdapter {
    constructor(parts, nativeMap, T) {
      super(parts, 'tianditu');
      this.nativeMap = nativeMap;
      this.T = T;
      this.bind('move', 'move');
      this.bind('moveend', 'moveend');
      this.bind('zoomstart', 'zoom');
      this.bind('zoomend', 'zoomend');
      this.bind('tilesloaded', 'complete');
    }

    bind(nativeName, name) {
      if (typeof this.nativeMap.addEventListener !== 'function') return;
      const handler = () => this.emit(name);
      this.nativeMap.addEventListener(nativeName, handler);
      this.track(() => this.nativeMap.removeEventListener(nativeName, handler));
    }

    setView(latlng, zoom = this.getZoom()) {
      const point = normalizeLatLng(latlng);
      if (point) this.nativeMap.centerAndZoom(new this.T.LngLat(point[1], point[0]), clampZoom(zoom, this.getZoom()));
      return this;
    }

    getCenter() {
      const center = this.nativeMap.getCenter && this.nativeMap.getCenter();
      if (!center) return DEFAULT_CENTER.slice();
      const lat = typeof center.getLat === 'function' ? center.getLat() : center.lat;
      const lon = typeof center.getLng === 'function' ? center.getLng() : center.lng;
      return [Number(lat), Number(lon)];
    }

    getZoom() {
      return Number(this.nativeMap.getZoom && this.nativeMap.getZoom()) || DEFAULT_ZOOM;
    }

    invalidateSize() {
      if (typeof this.nativeMap.checkResize === 'function') this.nativeMap.checkResize();
      return super.invalidateSize();
    }

    destroyNative() {
      if (this.nativeMap && typeof this.nativeMap.clearOverLays === 'function') this.nativeMap.clearOverLays();
    }
  }

  class GoogleAdapter extends BaseMapAdapter {
    constructor(parts, nativeMap, google) {
      super(parts, 'google');
      this.nativeMap = nativeMap;
      this.google = google;
      this.projectionOverlay = new google.maps.OverlayView();
      this.projectionOverlay.onAdd = function () {};
      this.projectionOverlay.draw = function () {};
      this.projectionOverlay.onRemove = function () {};
      this.projectionOverlay.setMap(nativeMap);
      this.bind('center_changed', 'move');
      this.bind('zoom_changed', 'zoom');
      this.bind('idle', 'moveend');
      this.bind('tilesloaded', 'complete');
    }

    bind(nativeName, name) {
      const listener = this.google.maps.event.addListener(this.nativeMap, nativeName, () => {
        this.emit(name);
        if (nativeName === 'idle') this.emit('zoomend');
      });
      this.track(() => listener.remove());
    }

    setView(latlng, zoom = this.getZoom()) {
      const point = normalizeLatLng(latlng);
      if (point) {
        this.nativeMap.setCenter({ lat: point[0], lng: point[1] });
        this.nativeMap.setZoom(clampZoom(zoom, this.getZoom()));
      }
      return this;
    }

    flyTo(latlng, zoom = this.getZoom()) {
      const point = normalizeLatLng(latlng);
      if (point) {
        this.nativeMap.panTo({ lat: point[0], lng: point[1] });
        this.nativeMap.setZoom(clampZoom(zoom, this.getZoom()));
      }
      return this;
    }

    getCenter() {
      const center = this.nativeMap.getCenter();
      return center ? [Number(center.lat()), Number(center.lng())] : DEFAULT_CENTER.slice();
    }

    getZoom() {
      return Number(this.nativeMap.getZoom()) || DEFAULT_ZOOM;
    }

    fitBounds(bounds, options = {}) {
      const normalized = normalizeBounds(bounds);
      if (!normalized) return this;
      const value = new this.google.maps.LatLngBounds(
        { lat: normalized.minLat, lng: normalized.minLon },
        { lat: normalized.maxLat, lng: normalized.maxLon }
      );
      const padding = normalizePadding(options.padding);
      this.nativeMap.fitBounds(value, {
        top: padding[0],
        right: padding[1],
        bottom: padding[2],
        left: padding[3]
      });
      return this;
    }

    latLngToContainerPoint(latlng) {
      const point = normalizeLatLng(latlng);
      const projection = this.projectionOverlay.getProjection && this.projectionOverlay.getProjection();
      if (point && projection && typeof projection.fromLatLngToContainerPixel === 'function') {
        const pixel = projection.fromLatLngToContainerPixel(new this.google.maps.LatLng(point[0], point[1]));
        if (pixel) return { x: Number(pixel.x), y: Number(pixel.y) };
      }
      return super.latLngToContainerPoint(latlng);
    }

    invalidateSize() {
      this.google.maps.event.trigger(this.nativeMap, 'resize');
      return super.invalidateSize();
    }

    destroyNative() {
      if (this.projectionOverlay) this.projectionOverlay.setMap(null);
      if (this.nativeMap) this.google.maps.event.clearInstanceListeners(this.nativeMap);
    }
  }

  class GoogleEmbedAdapter extends BaseMapAdapter {
    constructor(parts, center, zoom) {
      super(parts, 'google');
      this.center = normalizeLatLng(center) || DEFAULT_CENTER.slice();
      this.zoom = clampZoom(zoom, DEFAULT_ZOOM);
      this.root.dataset.embedMode = 'share';
      this.canvas.classList.add('provider-map-google-share');
      this.pendingFrame = null;
      this.pendingFrameTimer = 0;
      this.iframe = document.createElement('iframe');
      this.iframe.className = 'google-share-embed';
      this.iframe.title = 'Google Maps';
      this.iframe.loading = 'eager';
      this.iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      this.iframe.setAttribute('allowfullscreen', '');
      this.iframe.tabIndex = 0;
      this.readyPromise = new Promise(resolve => {
        this.iframe.addEventListener('load', () => resolve(this), { once: true });
      });
      this.canvas.append(this.iframe);
      const onLanguageChange = () => this.refreshLanguageFrame();
      window.addEventListener('quake-language-change', onLanguageChange);
      this.track(() => window.removeEventListener('quake-language-change', onLanguageChange));
      this.renderFrame();
    }

    whenReady() {
      return withTimeout(this.readyPromise, 10000, 'Google Maps 分享嵌入加载超时').catch(() => this);
    }

    renderFrame() {
      this.cancelPendingFrame();
      const nextUrl = googleShareEmbedUrl(this.center, this.zoom);
      if (this.iframe.src !== nextUrl) this.iframe.src = nextUrl;
      this.emit('move');
      this.emit('complete');
    }

    refreshLanguageFrame() {
      const nextUrl = googleShareEmbedUrl(this.center, this.zoom);
      if (this.iframe.src === nextUrl) {
        this.cancelPendingFrame();
        return;
      }
      this.cancelPendingFrame();
      const current = this.iframe;
      const replacement = current.cloneNode(false);
      replacement.removeAttribute('src');
      replacement.style.opacity = '0';
      replacement.style.pointerEvents = 'none';
      replacement.addEventListener('load', () => {
        if (this.destroyed || this.iframe !== current) {
          replacement.remove();
          return;
        }
        window.clearTimeout(this.pendingFrameTimer);
        this.pendingFrameTimer = window.setTimeout(() => {
          if (this.destroyed || this.iframe !== current || this.pendingFrame !== replacement) return;
          replacement.style.removeProperty('opacity');
          replacement.style.removeProperty('pointer-events');
          current.replaceWith(replacement);
          this.iframe = replacement;
          this.pendingFrame = null;
          this.pendingFrameTimer = 0;
          this.emit('complete');
        }, 1200);
      }, { once: true });
      this.pendingFrame = replacement;
      this.canvas.appendChild(replacement);
      replacement.src = nextUrl;
      this.pendingFrameTimer = window.setTimeout(() => this.cancelPendingFrame(), 12000);
    }

    cancelPendingFrame() {
      window.clearTimeout(this.pendingFrameTimer);
      this.pendingFrameTimer = 0;
      if (this.pendingFrame) this.pendingFrame.remove();
      this.pendingFrame = null;
    }

    setView(latlng, zoom = this.getZoom()) {
      const point = normalizeLatLng(latlng);
      if (point) this.center = point;
      this.zoom = clampZoom(zoom, this.zoom);
      this.renderFrame();
      this.emit('moveend');
      this.emit('zoomend');
      return this;
    }

    getCenter() {
      return this.center.slice();
    }

    getZoom() {
      return this.zoom;
    }

    destroyNative() {
      this.cancelPendingFrame();
      delete this.root.dataset.embedMode;
    }
  }

  class YandexAdapter extends BaseMapAdapter {
    constructor(parts, nativeMap) {
      super(parts, 'yandex');
      this.nativeMap = nativeMap;
      this.bind('boundschange', 'move');
      this.bind('actionend', 'moveend');
      window.setTimeout(() => this.emit('complete'), 0);
    }

    bind(nativeName, name) {
      if (!this.nativeMap.events) return;
      const handler = () => {
        this.emit(name);
        if (nativeName === 'boundschange') this.emit('zoom');
        if (nativeName === 'actionend') this.emit('zoomend');
      };
      this.nativeMap.events.add(nativeName, handler);
      this.track(() => this.nativeMap.events.remove(nativeName, handler));
    }

    setView(latlng, zoom = this.getZoom()) {
      const point = normalizeLatLng(latlng);
      if (point) this.nativeMap.setCenter(point, clampZoom(zoom, this.getZoom()), { duration: 0 });
      return this;
    }

    flyTo(latlng, zoom = this.getZoom()) {
      const point = normalizeLatLng(latlng);
      if (point) this.nativeMap.setCenter(point, clampZoom(zoom, this.getZoom()), { duration: 350 });
      return this;
    }

    getCenter() {
      const center = this.nativeMap.getCenter();
      return normalizeLatLng(center) || DEFAULT_CENTER.slice();
    }

    getZoom() {
      return Number(this.nativeMap.getZoom()) || DEFAULT_ZOOM;
    }

    fitBounds(bounds, options = {}) {
      const normalized = normalizeBounds(bounds);
      if (!normalized) return this;
      this.nativeMap.setBounds(
        [[normalized.minLat, normalized.minLon], [normalized.maxLat, normalized.maxLon]],
        { checkZoomRange: true, zoomMargin: normalizePadding(options.padding) }
      );
      return this;
    }

    invalidateSize() {
      if (this.nativeMap.container && typeof this.nativeMap.container.fitToViewport === 'function') {
        this.nativeMap.container.fitToViewport();
      }
      return super.invalidateSize();
    }

    destroyNative() {
      if (this.nativeMap && typeof this.nativeMap.destroy === 'function') this.nativeMap.destroy();
    }
  }

  class EsriAdapter extends BaseMapAdapter {
    constructor(parts, view, reactiveUtils) {
      super(parts, 'esri');
      this.view = view;
      const handle = reactiveUtils.watch(
        () => [view.center && view.center.longitude, view.center && view.center.latitude, view.zoom],
        () => {
          this.emit('move');
          this.emit('zoom');
        }
      );
      this.track(() => handle.remove());
      const stationary = reactiveUtils.watch(
        () => view.stationary,
        value => {
          if (value) {
            this.emit('moveend');
            this.emit('zoomend');
            this.emit('complete');
          }
        }
      );
      this.track(() => stationary.remove());
    }

    setView(latlng, zoom = this.getZoom()) {
      const point = normalizeLatLng(latlng);
      if (point) this.view.goTo({ center: [point[1], point[0]], zoom: clampZoom(zoom, this.getZoom()) }, { animate: false }).catch(() => {});
      return this;
    }

    flyTo(latlng, zoom = this.getZoom()) {
      const point = normalizeLatLng(latlng);
      if (point) this.view.goTo({ center: [point[1], point[0]], zoom: clampZoom(zoom, this.getZoom()) }, { duration: 550 }).catch(() => {});
      return this;
    }

    getCenter() {
      const center = this.view.center;
      return center ? [Number(center.latitude), Number(center.longitude)] : DEFAULT_CENTER.slice();
    }

    getZoom() {
      return Number(this.view.zoom) || DEFAULT_ZOOM;
    }

    latLngToContainerPoint(latlng) {
      const point = normalizeLatLng(latlng);
      if (!point) return null;
      try {
        const pixel = this.view.toScreen({
          type: 'point',
          longitude: point[1],
          latitude: point[0],
          spatialReference: { wkid: 4326 }
        });
        if (pixel && Number.isFinite(Number(pixel.x)) && Number.isFinite(Number(pixel.y))) {
          return { x: Number(pixel.x), y: Number(pixel.y) };
        }
      } catch (_) {
        // ArcGIS can reject WGS84 projection while its view is still becoming ready.
      }
      return super.latLngToContainerPoint(point);
    }

    invalidateSize() {
      if (typeof this.view.resize === 'function') this.view.resize();
      return super.invalidateSize();
    }

    destroyNative() {
      if (this.view && typeof this.view.destroy === 'function') this.view.destroy();
    }
  }

  class OpenLayersAdapter extends BaseMapAdapter {
    constructor(parts, nativeMap, view, modules) {
      super(parts, 'osm');
      this.nativeMap = nativeMap;
      this.view = view;
      this.modules = modules;
      this.bindMap('movestart', 'move');
      this.bindMap('moveend', 'moveend');
      this.bindMap('rendercomplete', 'complete');
      this.bindView('change:center', 'move');
      this.bindView('change:resolution', 'zoom');
    }

    bindMap(nativeName, name) {
      const handler = () => {
        this.emit(name);
        if (nativeName === 'moveend') this.emit('zoomend');
      };
      this.nativeMap.on(nativeName, handler);
      this.track(() => this.nativeMap.un(nativeName, handler));
    }

    bindView(nativeName, name) {
      const handler = () => this.emit(name);
      this.view.on(nativeName, handler);
      this.track(() => this.view.un(nativeName, handler));
    }

    setView(latlng, zoom = this.getZoom()) {
      const point = normalizeLatLng(latlng);
      if (point) {
        this.view.setCenter(this.modules.fromLonLat([point[1], point[0]]));
        this.view.setZoom(clampZoom(zoom, this.getZoom()));
      }
      return this;
    }

    flyTo(latlng, zoom = this.getZoom()) {
      const point = normalizeLatLng(latlng);
      if (point) {
        this.view.animate({
          center: this.modules.fromLonLat([point[1], point[0]]),
          zoom: clampZoom(zoom, this.getZoom()),
          duration: 450
        });
      }
      return this;
    }

    getCenter() {
      const center = this.view.getCenter();
      if (!center) return DEFAULT_CENTER.slice();
      const lonLat = this.modules.toLonLat(center);
      return [Number(lonLat[1]), Number(lonLat[0])];
    }

    getZoom() {
      return Number(this.view.getZoom()) || DEFAULT_ZOOM;
    }

    fitBounds(bounds, options = {}) {
      const normalized = normalizeBounds(bounds);
      if (!normalized) return this;
      const extent = this.modules.transformExtent(
        [normalized.minLon, normalized.minLat, normalized.maxLon, normalized.maxLat],
        'EPSG:4326',
        'EPSG:3857'
      );
      this.view.fit(extent, {
        size: this.nativeMap.getSize(),
        padding: normalizePadding(options.padding),
        duration: options.animate === false ? 0 : 450,
        maxZoom: 12
      });
      return this;
    }

    latLngToContainerPoint(latlng) {
      const point = normalizeLatLng(latlng);
      if (!point) return null;
      const pixel = this.nativeMap.getPixelFromCoordinate(this.modules.fromLonLat([point[1], point[0]]));
      return pixel ? { x: Number(pixel[0]), y: Number(pixel[1]) } : null;
    }

    invalidateSize() {
      this.nativeMap.updateSize();
      return super.invalidateSize();
    }

    destroyNative() {
      if (this.nativeMap) this.nativeMap.setTarget(null);
    }
  }

  async function createAmap(parts, options) {
    const AMap = await loadAmap(options.config);
    const map = new AMap.Map(parts.canvas, {
      center: [options.center[1], options.center[0]],
      zoom: options.zoom,
      viewMode: '2D',
      resizeEnable: true
    });
    const adapter = new AmapAdapter(parts, map, AMap);
    if (AMap.Scale) map.addControl(new AMap.Scale({ position: 'LB' }));
    if (AMap.ToolBar) map.addControl(new AMap.ToolBar({ position: { top: '14px', left: '14px' } }));
    await waitForAdapter(adapter, parts.canvas);
    return adapter;
  }

  async function createTianditu(parts, options) {
    const token = String(options.token || options.config.tiandituToken || '').trim();
    const T = await loadTianditu(token);
    const map = new T.Map(parts.canvas.id, { projection: 'EPSG:900913', minZoom: 3, maxZoom: 18 });
    map.centerAndZoom(new T.LngLat(options.center[1], options.center[0]), options.zoom);
    if (T.Control && T.Control.Zoom) map.addControl(new T.Control.Zoom());
    if (T.Control && T.Control.Scale) map.addControl(new T.Control.Scale());
    const adapter = new TiandituAdapter(parts, map, T);
    await waitForAdapter(adapter, parts.canvas, 7000);
    return adapter;
  }

  async function createGoogle(parts, options) {
    if (!options.config.googleMapsJsKey) {
      const adapter = new GoogleEmbedAdapter(parts, options.center, options.zoom);
      await adapter.whenReady();
      return adapter;
    }
    const google = await loadGoogle(options.config.googleMapsJsKey);
    const map = new google.maps.Map(parts.canvas, {
      center: { lat: options.center[0], lng: options.center[1] },
      zoom: options.zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM },
      gestureHandling: 'greedy'
    });
    const adapter = new GoogleAdapter(parts, map, google);
    await waitForAdapter(adapter, parts.canvas);
    return adapter;
  }

  async function createYandex(parts, options) {
    const ymaps = await loadYandex();
    const map = new ymaps.Map(parts.canvas, {
      center: options.center,
      zoom: options.zoom,
      controls: ['zoomControl', 'typeSelector']
    }, {
      suppressMapOpenBlock: true,
      minZoom: 3,
      maxZoom: 19
    });
    const adapter = new YandexAdapter(parts, map);
    await nextPaint();
    return adapter;
  }

  async function createEsri(parts, options) {
    const arcgis = await loadEsri();
    const [ArcGISMap, MapView, TileLayer, reactiveUtils] = await window.$arcgis.import([
      '@arcgis/core/Map.js',
      '@arcgis/core/views/MapView.js',
      '@arcgis/core/layers/TileLayer.js',
      '@arcgis/core/core/reactiveUtils.js'
    ]);
    const layerOptions = {
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer'
    };
    if (options.config.esriApiKey) layerOptions.apiKey = options.config.esriApiKey;
    const map = new ArcGISMap({ layers: [new TileLayer(layerOptions)] });
    const view = new MapView({
      container: parts.canvas,
      map,
      center: [options.center[1], options.center[0]],
      zoom: options.zoom,
      constraints: { minZoom: 3, maxZoom: 18 }
    });
    await withTimeout(view.when(), SDK_TIMEOUT_MS, 'ArcGIS 视图初始化超时');
    const adapter = new EsriAdapter(parts, view, reactiveUtils);
    adapter.emit('complete');
    return adapter;
  }

  async function createOsm(parts, options) {
    const modules = await loadOpenLayers();
    const controls = modules.defaultControls({ attribution: true, rotate: false, zoom: true });
    controls.extend([new modules.ScaleLine({ units: 'metric' })]);
    const view = new modules.View({
      center: modules.fromLonLat([options.center[1], options.center[0]]),
      zoom: options.zoom,
      minZoom: 3,
      maxZoom: 19
    });
    const map = new modules.OlMap({
      target: parts.canvas,
      controls,
      layers: [new modules.TileLayer({ source: new modules.OSM({ crossOrigin: 'anonymous' }) })],
      view
    });
    const adapter = new OpenLayersAdapter(parts, map, view, modules);
    map.renderSync();
    await waitForAdapter(adapter, parts.canvas, 7000);
    return adapter;
  }

  function loadAmap(config) {
    if (window.AMap) return Promise.resolve(window.AMap);
    if (!config.amapJsKey) return Promise.reject(new Error('未配置 AMAP_JS_KEY'));
    if (config.amapServiceHost) {
      window._AMapSecurityConfig = {
        ...(window._AMapSecurityConfig || {}),
        serviceHost: config.amapServiceHost
      };
    }
    return loadCallbackSdk(
      'amap',
      callback => 'https://webapi.amap.com/maps?v=2.0&key=' +
        encodeURIComponent(config.amapJsKey) +
        '&plugin=AMap.Scale,AMap.ToolBar&callback=' + encodeURIComponent(callback),
      () => window.AMap
    );
  }

  function loadTianditu(token) {
    if (window.T && window.T.Map) return Promise.resolve(window.T);
    return loadSimpleSdk(
      'tianditu',
      'https://api.tianditu.gov.cn/api?v=4.0&tk=' + encodeURIComponent(token),
      () => window.T && window.T.Map ? window.T : null
    );
  }

  function loadGoogle(key) {
    if (window.google && window.google.maps) return Promise.resolve(window.google);
    return loadCallbackSdk(
      'google',
      callback => 'https://maps.googleapis.com/maps/api/js?key=' +
        encodeURIComponent(key) +
        '&loading=async&v=weekly&language=zh-CN&region=CN&callback=' + encodeURIComponent(callback),
      () => window.google && window.google.maps ? window.google : null
    );
  }

  async function loadYandex() {
    if (!window.ymaps) {
      const access = await requestYandexAccess();
      await loadSimpleSdk(
        'yandex',
        'https://api-maps.yandex.ru/2.1/?apikey=' + encodeURIComponent(access.apiKey) + '&lang=ru_RU',
        () => window.ymaps
      );
    }
    await withTimeout(new Promise((resolve, reject) => {
      window.ymaps.ready(resolve, reject);
    }), SDK_TIMEOUT_MS, 'Yandex Maps 初始化超时');
    return window.ymaps;
  }

  function requestYandexAccess() {
    if (sdkPromises.has('yandex-access')) return sdkPromises.get('yandex-access');
    const promise = fetch('/map/yandex-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ sessionId: yandexSessionId() })
    }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.apiKey) {
        const error = new Error(data.message || `Yandex 授权失败（HTTP ${response.status}）`);
        error.code = data.code || '';
        error.fallback = data.fallback || '';
        throw error;
      }
      const config = window.__QUAKE_CONFIG__ || {};
      config.yandexQuotaUsed = Number(data.used) || 0;
      config.yandexQuotaRemaining = Number(data.remaining) || 0;
      window.__QUAKE_CONFIG__ = config;
      window.dispatchEvent(new CustomEvent('quake-yandex-quota', {
        detail: { used: config.yandexQuotaUsed, remaining: config.yandexQuotaRemaining }
      }));
      return data;
    }).catch(error => {
      sdkPromises.delete('yandex-access');
      throw error;
    });
    sdkPromises.set('yandex-access', promise);
    return promise;
  }

  function yandexSessionId() {
    const storageKey = 'quake-yandex-map-session';
    try {
      const current = window.sessionStorage.getItem(storageKey);
      if (/^[A-Za-z0-9_-]{16,96}$/.test(current || '')) return current;
    } catch (_error) {
      // A fresh secure session ID still works when session storage is blocked.
    }
    const bytes = new Uint8Array(18);
    window.crypto.getRandomValues(bytes);
    const value = Array.from(bytes, item => item.toString(16).padStart(2, '0')).join('');
    try {
      window.sessionStorage.setItem(storageKey, value);
    } catch (_error) {
      // Keep the secure in-memory value for this SDK load.
    }
    return value;
  }

  async function loadEsri() {
    ensureStylesheet('arcgis-sdk-css', 'https://js.arcgis.com/5.1/esri/themes/light/main.css');
    await loadSimpleSdk(
      'esri',
      'https://js.arcgis.com/5.1/',
      () => window.$arcgis && typeof window.$arcgis.import === 'function',
      { type: 'module' }
    );
    return window.$arcgis;
  }

  function loadOpenLayers() {
    if (sdkPromises.has('openlayers')) return sdkPromises.get('openlayers');
    ensureStylesheet('openlayers-css', '/vendor/ol/ol.css');
    const promise = loadSimpleSdk(
      'openlayers-runtime',
      '/vendor/ol/dist/ol.js',
      () => window.ol && window.ol.Map && window.ol.layer && window.ol.source ? window.ol : null
    ).then(ol => ({
      OlMap: ol.Map,
      View: ol.View,
      TileLayer: ol.layer.Tile,
      OSM: ol.source.OSM,
      defaultControls: ol.control.defaults && ol.control.defaults.defaults
        ? ol.control.defaults.defaults
        : ol.control.defaults,
      ScaleLine: ol.control.ScaleLine,
      fromLonLat: ol.proj.fromLonLat,
      toLonLat: ol.proj.toLonLat,
      transformExtent: ol.proj.transformExtent
    })).catch(error => {
      sdkPromises.delete('openlayers');
      throw error;
    });
    sdkPromises.set('openlayers', promise);
    return promise;
  }

  function loadCallbackSdk(key, urlFactory, ready) {
    const current = ready();
    if (current) return Promise.resolve(current);
    if (sdkPromises.has(key)) return sdkPromises.get(key);
    const promise = new Promise((resolve, reject) => {
      const callback = '__quake_' + key + '_' + Date.now().toString(36);
      const script = document.createElement('script');
      const finish = () => {
        window.clearTimeout(timer);
        delete window[callback];
        const value = ready();
        if (value) resolve(value);
        else reject(new Error('官方 SDK 未返回可用对象'));
      };
      const fail = () => {
        window.clearTimeout(timer);
        delete window[callback];
        script.remove();
        reject(new Error('官方 SDK 请求失败'));
      };
      window[callback] = finish;
      script.dataset.quakeSdk = key;
      script.async = true;
      script.src = urlFactory(callback);
      script.onerror = fail;
      script.onload = () => {
        if (ready()) finish();
      };
      const timer = window.setTimeout(fail, SDK_TIMEOUT_MS);
      document.head.appendChild(script);
    }).catch(error => {
      sdkPromises.delete(key);
      throw error;
    });
    sdkPromises.set(key, promise);
    return promise;
  }

  function loadSimpleSdk(key, src, ready, options = {}) {
    const current = ready();
    if (current) return Promise.resolve(current);
    if (sdkPromises.has(key)) return sdkPromises.get(key);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.dataset.quakeSdk = key;
      script.async = true;
      if (options.type) script.type = options.type;
      script.src = src;
      script.onerror = () => {
        script.remove();
        reject(new Error('官方 SDK 请求失败'));
      };
      script.onload = () => {
        waitForGlobal(ready, SDK_TIMEOUT_MS).then(resolve, reject);
      };
      document.head.appendChild(script);
    }).catch(error => {
      sdkPromises.delete(key);
      throw error;
    });
    sdkPromises.set(key, promise);
    return promise;
  }

  function waitForGlobal(read, timeoutMs) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        const value = read();
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error('官方 SDK 初始化超时'));
          return;
        }
        window.setTimeout(check, 50);
      };
      check();
    });
  }

  function waitForAdapter(adapter, canvas, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = 0;
      let pollTimer = 0;
      const finish = ok => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.clearTimeout(pollTimer);
        adapter.off('complete', onComplete);
        if (ok) resolve(adapter);
        else reject(new Error('地图画布未完成渲染'));
      };
      const onComplete = () => finish(true);
      adapter.on('complete', onComplete);
      timer = window.setTimeout(() => finish(Boolean(canvas.childElementCount)), timeoutMs);
      const pollRenderedSurface = () => {
        if (settled) return;
        if (canvasHasRenderedSurface(canvas)) {
          window.requestAnimationFrame(() => finish(true));
          return;
        }
        pollTimer = window.setTimeout(pollRenderedSurface, 100);
      };
      pollRenderedSurface();
    });
  }

  function canvasHasRenderedSurface(canvas) {
    const loadedImage = Array.from(canvas.querySelectorAll('img'))
      .some(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
    if (loadedImage) return true;
    return Array.from(canvas.querySelectorAll('canvas'))
      .some(surface => Number(surface.width) > 0 && Number(surface.height) > 0);
  }

  function ensureStylesheet(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function withTimeout(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      Promise.resolve(promise).then(
        value => {
          window.clearTimeout(timer);
          resolve(value);
        },
        error => {
          window.clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  function nextPaint() {
    return new Promise(resolve => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
  }

  function divIcon(options = {}) {
    return {
      className: options.className || '',
      html: options.html || '',
      iconSize: options.iconSize || [1, 1],
      iconAnchor: options.iconAnchor || [0, 0]
    };
  }

  function marker(latlng, options) {
    return new OverlayMarker(latlng, options);
  }

  function splitEventNames(names) {
    return String(names || '').split(/\s+/).filter(Boolean);
  }

  function normalizeLatLng(value) {
    const lat = Number(Array.isArray(value) ? value[0] : value && value.lat);
    const lon = Number(Array.isArray(value) ? value[1] : value && (value.lng ?? value.lon));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return [lat, lon];
  }

  function normalizeBounds(bounds) {
    const first = normalizeLatLng(bounds && bounds[0]);
    const second = normalizeLatLng(bounds && bounds[1]);
    if (!first || !second) return null;
    return {
      minLat: Math.min(first[0], second[0]),
      maxLat: Math.max(first[0], second[0]),
      minLon: Math.min(first[1], second[1]),
      maxLon: Math.max(first[1], second[1])
    };
  }

  function normalizePadding(value) {
    if (Array.isArray(value)) {
      if (value.length === 2) return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[0]) || 0, Number(value[1]) || 0];
      if (value.length >= 4) return value.slice(0, 4).map(item => Number(item) || 0);
    }
    const number = Number(value) || 0;
    return [number, number, number, number];
  }

  function clampZoom(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(2, Math.min(20, number)) : fallback;
  }

  function externalProviderUrl(key, options = {}) {
    if (key !== 'google') return '';
    const center = normalizeLatLng(options.center) || DEFAULT_CENTER;
    const url = new URL('https://www.google.com/maps/@');
    url.searchParams.set('api', '1');
    url.searchParams.set('map_action', 'map');
    url.searchParams.set('center', `${center[0].toFixed(6)},${center[1].toFixed(6)}`);
    url.searchParams.set('zoom', String(Math.round(clampZoom(options.zoom, DEFAULT_ZOOM))));
    url.searchParams.set('basemap', 'roadmap');
    return url.href;
  }

  function googleShareEmbedUrl(centerValue, zoomValue) {
    const center = normalizeLatLng(centerValue) || DEFAULT_CENTER;
    const language = document.documentElement.lang && document.documentElement.lang.toLowerCase().startsWith('en')
      ? 'en'
      : 'zh-CN';
    const url = new URL('https://www.google.com/maps');
    url.searchParams.set('q', `${center[0].toFixed(6)},${center[1].toFixed(6)}`);
    url.searchParams.set('z', String(Math.round(clampZoom(zoomValue, DEFAULT_ZOOM))));
    url.searchParams.set('output', 'embed');
    url.searchParams.set('hl', language);
    return url.href;
  }

  function boundsView(bounds, canvas, paddingValue) {
    const normalized = normalizeBounds(bounds);
    if (!normalized) return null;
    const padding = normalizePadding(paddingValue);
    const width = Math.max(256, Number(canvas.clientWidth) - padding[1] - padding[3]);
    const height = Math.max(256, Number(canvas.clientHeight) - padding[0] - padding[2]);
    const lonFraction = Math.max((normalized.maxLon - normalized.minLon) / 360, 1e-9);
    const latFraction = Math.max(
      Math.abs(mercatorY(normalized.maxLat) - mercatorY(normalized.minLat)),
      1e-9
    );
    const zoomX = Math.log2(width / 256 / lonFraction);
    const zoomY = Math.log2(height / 256 / latFraction);
    return {
      center: [
        (normalized.minLat + normalized.maxLat) / 2,
        (normalized.minLon + normalized.maxLon) / 2
      ],
      zoom: Math.max(2, Math.min(12, Math.floor(Math.min(zoomX, zoomY))))
    };
  }

  function projectWebMercator(latlng, center, zoom, canvas) {
    const point = normalizeLatLng(latlng);
    const centerPoint = normalizeLatLng(center);
    if (!point || !centerPoint) return null;
    const scale = 256 * Math.pow(2, clampZoom(zoom, DEFAULT_ZOOM));
    const targetX = (point[1] + 180) / 360 * scale;
    const centerX = (centerPoint[1] + 180) / 360 * scale;
    let deltaX = targetX - centerX;
    if (deltaX > scale / 2) deltaX -= scale;
    if (deltaX < -scale / 2) deltaX += scale;
    const targetY = mercatorY(point[0]) * scale;
    const centerY = mercatorY(centerPoint[0]) * scale;
    return {
      x: Number(canvas.clientWidth) / 2 + deltaX,
      y: Number(canvas.clientHeight) / 2 + targetY - centerY
    };
  }

  function mercatorY(latitude) {
    const clamped = Math.max(-85.05112878, Math.min(85.05112878, Number(latitude) || 0));
    const sin = Math.sin(clamped * Math.PI / 180);
    return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  }

  function safeErrorMessage(error) {
    const value = String(error && error.message || error || '').replace(/[\r\n]+/g, ' ').trim();
    return value.slice(0, 160);
  }

  window.OfficialMap = {
    availability: providerAvailability,
    candidates: providerCandidates,
    config: clientConfig,
    create: createProviderMap,
    prepare: prepareProvider,
    externalUrl: externalProviderUrl,
    marker,
    divIcon,
    labels: { ...PROVIDER_LABELS }
  };
})();
