(function () {
  'use strict';

  const STORAGE_KEY = 'quakeVoiceEnabled';
  const SHARED_DEDUPE_KEY = 'quakeVoiceLastSpoken';
  const SHARED_DEDUPE_MS = 24 * 60 * 60 * 1000;
  const MAX_SPOKEN_KEYS = 120;
  const spokenKeys = new Set();
  const spokenOrder = [];
  const dedupeChannel = typeof window.BroadcastChannel === 'function' ? new window.BroadcastChannel('quake-voice-dedupe') : null;
  let enabled = false;
  let initialized = false;

  if (dedupeChannel) dedupeChannel.addEventListener('message', event => rememberInMemory(String(event.data || '')));

  function supported() {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  async function init() {
    if (initialized) return enabled;
    initialized = true;
    const storage = window.SecureStorage;
    try {
      if (storage && storage.ready) await storage.ready;
      const stored = storage ? await storage.getItem(STORAGE_KEY) : null;
      enabled = stored === 'true' && supported();
    } catch (_error) {
      enabled = false;
    }
    return enabled;
  }

  function persist() {
    const storage = window.SecureStorage;
    if (storage) storage.setItem(STORAGE_KEY, String(enabled)).catch(() => {});
  }

  function language() {
    return document.documentElement.lang === 'en' ? 'en-US' : 'zh-CN';
  }

  function translated(value) {
    const source = String(value || '').trim();
    if (!source || document.documentElement.lang !== 'en') return source;
    return window.QuakeI18n && typeof window.QuakeI18n.t === 'function'
      ? window.QuakeI18n.t(source)
      : source;
  }

  function eventKey(event) {
    return String(
      event && (
        event.eventKey ||
        event.eventId ||
        [event.source, event.originTime, event.latitude, event.longitude, event.magnitude].join(':')
      ) || ''
    ).slice(0, 512);
  }

  function rememberInMemory(key) {
    if (!key || spokenKeys.has(key)) return;
    spokenKeys.add(key);
    spokenOrder.push(key);
    while (spokenOrder.length > MAX_SPOKEN_KEYS) spokenKeys.delete(spokenOrder.shift());
  }

  async function remember(key) {
    if (!key || spokenKeys.has(key)) return false;
    const storage = window.SecureStorage;
    try {
      if (storage && storage.ready) await storage.ready;
      const previous = JSON.parse(storage ? await storage.getItem(SHARED_DEDUPE_KEY) || '{}' : '{}');
      if (previous.key === key && Date.now() - Number(previous.time || 0) < SHARED_DEDUPE_MS) return false;
      if (storage) await storage.setItem(SHARED_DEDUPE_KEY, JSON.stringify({ key, time: Date.now() }));
    } catch (_error) {
      // In-memory deduplication remains available when encrypted storage is blocked.
    }
    rememberInMemory(key);
    if (dedupeChannel) dedupeChannel.postMessage(key);
    return true;
  }

  function voiceFor(lang) {
    const voices = window.speechSynthesis.getVoices();
    const prefix = lang.toLowerCase().split('-')[0];
    return voices.find(voice => String(voice.lang || '').toLowerCase() === lang.toLowerCase()) ||
      voices.find(voice => String(voice.lang || '').toLowerCase().startsWith(prefix)) ||
      null;
  }

  function speak(text, lang = language()) {
    if (!supported() || !String(text || '').trim()) return false;
    const utterance = new SpeechSynthesisUtterance(String(text).trim());
    utterance.lang = lang;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voice = voiceFor(lang);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function announcementText(event) {
    const magnitude = Number(event && event.magnitude);
    const place = translated(event && event.location) || (language() === 'en-US' ? 'an unknown location' : '未知震中');
    const depth = Number(event && event.depth);
    const hasDepth = Number.isFinite(depth) && depth >= 0;
    if (language() === 'en-US') {
      return `Earthquake alert. Magnitude ${magnitude.toFixed(1)} earthquake near ${place}.${hasDepth ? ` Depth ${Math.round(depth)} kilometers.` : ''} Stay alert and take appropriate safety precautions.`;
    }
    return `地震提醒。${place}发生${magnitude.toFixed(1)}级地震。${hasDepth ? `震源深度${Math.round(depth)}公里。` : ''}请注意安全并采取适当防护。`;
  }

  async function announce(event) {
    const magnitude = Number(event && event.magnitude);
    const key = eventKey(event);
    if (!enabled || !supported() || !event || event.isLive !== true || event.isHistory || event.isDebug || event.source === 'debug') return false;
    if (!Number.isFinite(magnitude) || !await remember(key)) return false;
    return speak(announcementText(event));
  }

  function setEnabled(next, options = {}) {
    enabled = Boolean(next) && supported();
    persist();
    if (!enabled && supported()) window.speechSynthesis.cancel();
    if (enabled && options.confirm) {
      speak(language() === 'en-US' ? 'Voice earthquake alerts enabled.' : '地震语音播报已开启。');
    }
    return enabled;
  }

  window.QuakeVoice = {
    init,
    supported,
    isEnabled: () => enabled,
    setEnabled,
    announce
  };
})();
