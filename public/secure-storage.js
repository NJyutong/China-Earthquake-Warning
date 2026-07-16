(function () {
  const DB_NAME = 'quake-secure-storage';
  const STORE_NAME = 'keys';
  const KEY_ID = 'aes-gcm-v1';
  const PREFIX = 'enc:v1:';
  const COOKIE_PREFIX = 'qs_';
  const LOCAL_PREFIX = 'qsl_';
  const CONSENT_COOKIE = 'qs_cookie_consent';
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5;
  const COOKIE_VALUE_LIMIT = 2800;
  const REQUIRED_STORAGE_KEYS = new Set([
    'quakeDesktopNotifications',
    'quakeNotificationThreshold',
    'quakeNotificationArea'
  ]);
  const OPTIONAL_STORAGE_KEYS = [
    'quakeCountryUserSelected',
    'quakeCountry',
    'quakeRegion',
    'quakeThemeMode',
    'quakeTheme',
    'quakeMapSource',
    'quakeIntensityThreshold',
    'quakeVoiceLastSpoken',
    'quakeNotifiedKeys',
    'quakeUserLocation',
    'quakeGuideSeen',
    'quakeRecentEvents',
    'tiandituToken'
  ];
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let keyPromise;

  function canEncrypt() {
    return Boolean(window.crypto && crypto.subtle && window.indexedDB);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function dbRequest(mode, action) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    }));
  }

  async function key() {
    if (!canEncrypt()) throw new Error('secure storage unavailable');
    if (keyPromise) return keyPromise;
    keyPromise = (async () => {
      const existing = await dbRequest('readonly', store => store.get(KEY_ID));
      if (existing) return existing;
      const generated = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await dbRequest('readwrite', store => store.put(generated, KEY_ID));
      return generated;
    })();
    return keyPromise;
  }

  function bytesToBase64(bytes) {
    const view = new Uint8Array(bytes);
    let binary = '';
    for (let index = 0; index < view.length; index += 0x8000) {
      binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    return Uint8Array.from(atob(value), char => char.charCodeAt(0));
  }

  function base64Url(bytes) {
    return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function cookieMap() {
    if (!document.cookie) return {};
    return document.cookie.split(/;\s*/).reduce((map, part) => {
      const index = part.indexOf('=');
      if (index < 0) return map;
      map[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
      return map;
    }, {});
  }

  function cookieName(name) {
    return `${COOKIE_PREFIX}${base64Url(encoder.encode(String(name)))}`;
  }

  function localName(name) {
    return `${LOCAL_PREFIX}${base64Url(encoder.encode(String(name)))}`;
  }

  function writeCookieRaw(name, value) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  }

  function deleteCookieRaw(name) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  }

  function consentText() {
    return cookieMap()[CONSENT_COOKIE] || '';
  }

  function cookieCategories() {
    const text = consentText();
    if (!text) return null;
    if (text === 'yes') return { personalization: true };
    if (text === 'no') return { personalization: false };
    try {
      const parsed = JSON.parse(text);
      return {
        personalization: Boolean(parsed.personalization)
      };
    } catch (_error) {
      return null;
    }
  }

  function canPersist() {
    const categories = cookieCategories();
    return Boolean(categories && categories.personalization);
  }

  function hasChoice() {
    return Boolean(cookieCategories());
  }

  function readCookie(name) {
    const base = cookieName(name);
    const cookies = cookieMap();
    const parts = Number(cookies[`${base}_parts`] || 0);
    if (parts > 0) {
      let value = '';
      for (let index = 0; index < parts; index += 1) {
        const chunk = cookies[`${base}_${index}`];
        if (chunk === undefined) return null;
        value += chunk;
      }
      return value;
    }
    return cookies[base] === undefined ? null : cookies[base];
  }

  function removeCookie(name) {
    const base = cookieName(name);
    Object.keys(cookieMap()).forEach(cookie => {
      if (cookie === base || cookie.startsWith(`${base}_`)) deleteCookieRaw(cookie);
    });
  }

  function writeCookie(name, value) {
    const base = cookieName(name);
    removeCookie(name);
    if (String(value).length > COOKIE_VALUE_LIMIT) return false;
    writeCookieRaw(base, value);
    return true;
  }

  function readLocal(name) {
    try {
      return localStorage.getItem(localName(name));
    } catch (_error) {
      return null;
    }
  }

  function writeLocal(name, value) {
    try {
      localStorage.setItem(localName(name), value);
    } catch (_error) {
      // 本机存储不可用时直接放弃持久化，避免退回 Cookie 造成 431。
    }
  }

  function removeLocal(name) {
    try {
      localStorage.removeItem(localName(name));
    } catch (_error) {
      // 忽略浏览器限制。
    }
  }

  async function encrypt(value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), encoder.encode(String(value)));
    return `${PREFIX}${bytesToBase64(iv)}:${bytesToBase64(cipher)}`;
  }

  async function decrypt(value) {
    const payload = String(value).slice(PREFIX.length);
    const separator = payload.indexOf(':');
    if (separator <= 0 || separator === payload.length - 1) throw new Error('invalid encrypted storage payload');
    const ivText = payload.slice(0, separator);
    const cipherText = payload.slice(separator + 1);
    const iv = base64ToBytes(ivText);
    if (iv.byteLength !== 12) throw new Error('invalid encrypted storage IV');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await key(), base64ToBytes(cipherText));
    return decoder.decode(plain);
  }

  async function getItem(name) {
    if (!canPersist()) return null;
    let value = readLocal(name);
    if (value === null) {
      value = readCookie(name);
      if (value === null) return null;
      const plain = await readStoredValue(value, name);
      if (plain !== null) await setItem(name, plain);
      removeCookie(name);
      return plain;
    }
    return readStoredValue(value, name);
  }

  async function readStoredValue(value, name) {
    if (!canEncrypt()) {
      removeCookie(name);
      removeLocal(name);
      return null;
    }
    if (String(value).startsWith(PREFIX)) {
      try {
        return await decrypt(value);
      } catch (_error) {
        removeCookie(name);
        removeLocal(name);
        return null;
      }
    }
    return value;
  }

  async function setItem(name, value) {
    if (!canPersist() || !canEncrypt()) return;
    writeLocal(name, await encrypt(value));
    removeCookie(name);
  }

  async function getRequiredItem(name) {
    if (!REQUIRED_STORAGE_KEYS.has(name)) return getItem(name);
    let value = readLocal(name);
    if (value !== null) return readStoredValue(value, name);
    value = readCookie(name);
    if (value === null) return null;
    const plain = await readStoredValue(value, name);
    removeCookie(name);
    if (plain !== null) await setRequiredItem(name, plain);
    return plain;
  }

  async function setRequiredItem(name, value) {
    if (!REQUIRED_STORAGE_KEYS.has(name)) {
      await setItem(name, value);
      return;
    }
    if (!canEncrypt()) {
      removeCookie(name);
      removeLocal(name);
      return;
    }
    writeLocal(name, await encrypt(value));
    removeCookie(name);
  }

  function removeItem(name) {
    removeCookie(name);
    removeLocal(name);
  }

  function isRequiredCookieName(name) {
    if (name === CONSENT_COOKIE || name === 'qs_guide_seen') return true;
    return false;
  }

  function purgeOptionalCookies() {
    Object.keys(cookieMap()).forEach(name => {
      if (name.startsWith(COOKIE_PREFIX) && !isRequiredCookieName(name)) deleteCookieRaw(name);
    });
  }

  function clearStoredCookies() {
    purgeOptionalCookies();
    OPTIONAL_STORAGE_KEYS.forEach(removeLocal);
  }

  async function migrateLegacyOptionalCookies() {
    if (!canEncrypt()) {
      purgeOptionalCookies();
      return;
    }
    if (canPersist()) {
      for (const name of OPTIONAL_STORAGE_KEYS) {
        const value = readCookie(name);
        if (value === null) continue;
        try {
          const plain = String(value).startsWith(PREFIX) ? await decrypt(value) : value;
          writeLocal(name, await encrypt(plain));
        } catch (_error) {
          // 旧 Cookie 解不开时直接丢弃，避免继续撑大请求头。
        }
        removeCookie(name);
      }
    }
    purgeOptionalCookies();
  }

  async function migrateRequiredCookies() {
    if (!canEncrypt()) {
      REQUIRED_STORAGE_KEYS.forEach(removeCookie);
      return;
    }
    for (const name of REQUIRED_STORAGE_KEYS) {
      const value = readCookie(name);
      if (value === null) continue;
      try {
        const plain = String(value).startsWith(PREFIX) ? await decrypt(value) : value;
        writeLocal(name, await encrypt(plain));
      } catch (_error) {
        // 旧必要 Cookie 解不开时直接删除，避免继续撑大请求头。
      }
      removeCookie(name);
    }
  }

  function setCookieChoice(choice) {
    const categories = typeof choice === 'object' && choice
      ? {
          personalization: Boolean(choice.personalization)
        }
      : {
          personalization: Boolean(choice)
        };
    writeCookieRaw(CONSENT_COOKIE, JSON.stringify(categories));
    if (!categories.personalization) clearStoredCookies();
    else key().catch(() => {});
    window.dispatchEvent(new CustomEvent('secure-storage-cookie-choice', { detail: categories }));
  }

  function injectChoiceBar(force = false) {
    if ((!force && hasChoice()) || document.getElementById('cookie-choice-bar')) return;
    if (!document.getElementById('cookie-choice-style')) {
      const style = document.createElement('style');
      style.id = 'cookie-choice-style';
      style.textContent = `
      @keyframes cookieBarIn{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}
      @keyframes cookiePanelIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
      .cookie-choice-bar{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));z-index:var(--z-cookie-bar,5100);width:min(920px,calc(100vw - 28px));max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);transform:translateX(-50%);display:grid;grid-template-rows:minmax(0,1fr) auto;gap:18px;padding:22px;overflow:hidden;overscroll-behavior:contain;border:1px solid rgba(255,90,42,.32);border-radius:8px;background:rgba(252,252,250,.98);color:#1c2027;box-shadow:0 22px 70px rgba(0,0,0,.28);font:15px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;animation:cookieBarIn .22s linear}
      .cookie-choice-bar.closing{opacity:0;transform:translate(-50%,16px);transition:opacity .14s linear,transform .14s linear}
      html[data-theme="dark"] .cookie-choice-bar{background:rgba(18,22,29,.98);color:#f7f4ef;border-color:rgba(255,129,74,.38)}
      .cookie-choice-bar p{min-height:0;margin:0;max-width:840px;overflow:auto;overscroll-behavior:contain;padding-right:4px}
      .cookie-choice-bar strong{display:block;margin-bottom:6px;font-size:16px}
      .cookie-choice-bar .cookie-actions{display:flex;gap:18px;justify-content:space-between;align-items:center}
      .cookie-choice-bar button{min-height:46px;border:2px solid #ff5a2a;border-radius:0;padding:0 20px;background:transparent;color:inherit;font-weight:900;cursor:pointer;transition:transform .12s linear,background-color .16s linear,color .16s linear,box-shadow .16s linear}
      .cookie-choice-bar button:active,.cookie-settings-modal button:active,.cookie-switch:active{transform:scale(.97)}
      .cookie-choice-bar button:hover,.cookie-settings-modal button:hover{box-shadow:0 8px 22px rgba(255,90,42,.18)}
      .cookie-choice-bar .accept{background:#ff5a2a;color:#fff}
      .cookie-choice-bar .decline{margin-left:auto}
      .cookie-settings-modal{position:fixed;inset:0;z-index:var(--z-cookie-modal,6020);display:none;place-items:center;padding:12px;background:rgba(12,14,18,.46);font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .cookie-settings-modal.show{display:grid}
      .cookie-settings-modal.closing{opacity:0;transition:opacity .14s linear}
      .cookie-settings-modal.show .cookie-settings-panel{animation:cookiePanelIn .2s linear}
      .cookie-settings-panel{width:min(760px,100%);max-height:min(720px,calc(100vh - 24px));max-height:min(720px,calc(100dvh - 24px));overflow:auto;overscroll-behavior:contain;border:1px solid rgba(255,90,42,.3);border-radius:8px;background:#fff;color:#1c2027;box-shadow:0 26px 80px rgba(0,0,0,.34)}
      html[data-theme="dark"] .cookie-settings-panel{background:#151923;color:#f7f4ef}
      .cookie-settings-head{padding:20px 24px;border-bottom:1px solid rgba(127,127,127,.18)}
      .cookie-settings-head h2{margin:0 0 8px;font-size:22px}
      .cookie-settings-head p{margin:0;color:#667085}
      html[data-theme="dark"] .cookie-settings-head p{color:#b8c0cc}
      .cookie-row{display:grid;grid-template-columns:38px 1fr auto;gap:10px;align-items:center;padding:18px 24px;border-bottom:1px solid rgba(127,127,127,.22);transition:background-color .16s linear}
      .cookie-row.open{background:rgba(255,90,42,.06)}
      .cookie-row button{width:28px;height:28px;border:0;background:transparent;color:#17415f;font-size:24px;font-weight:900;cursor:pointer;transition:transform .16s linear,color .16s linear}
      .cookie-row.open > button{transform:rotate(180deg)}
      html[data-theme="dark"] .cookie-row button{color:#ffb08b}
      .cookie-row b{display:block;font-size:17px}
      .cookie-row small{display:block;max-height:0;overflow:hidden;opacity:0;margin-top:0;color:#667085;transition:opacity .18s linear}
      .cookie-row.open small{max-height:80px;opacity:1;margin-top:6px}
      html[data-theme="dark"] .cookie-row small{color:#b8c0cc}
      .cookie-status{font-weight:900}
      .cookie-switch{position:relative;width:66px;height:36px}
      .cookie-switch input{position:absolute;opacity:0}
      .cookie-switch span{position:absolute;inset:0;border-radius:999px;background:#858585;cursor:pointer;transition:background-color .18s linear,box-shadow .18s linear}
      .cookie-switch span::before{content:"";position:absolute;left:4px;top:4px;width:28px;height:28px;border-radius:50%;background:#fff;transition:transform .18s linear}
      .cookie-switch input:checked + span{background:#ff5a2a}
      .cookie-switch input:checked + span::before{transform:translateX(30px)}
      .cookie-settings-actions{position:sticky;bottom:0;z-index:1;display:flex;gap:22px;justify-content:flex-end;padding:24px;background:#f5f5f3}
      html[data-theme="dark"] .cookie-settings-actions{background:#1c2029}
      .cookie-settings-actions button{min-height:52px;border:2px solid #ff5a2a;border-radius:0;padding:0 22px;background:transparent;color:inherit;font-weight:900;cursor:pointer;transition:transform .12s linear,background-color .16s linear,color .16s linear,box-shadow .16s linear}
      .cookie-settings-actions .save{background:#ff5a2a;color:#fff}
      @media (max-width:640px){.cookie-choice-bar{bottom:max(8px,env(safe-area-inset-bottom));width:calc(100vw - 16px);max-height:calc(100dvh - 16px);gap:12px;padding:14px;font-size:13px;line-height:1.45}.cookie-choice-bar .cookie-actions{display:grid;grid-template-columns:1fr;gap:8px}.cookie-choice-bar .decline{margin-left:0}.cookie-choice-bar button{width:100%;min-height:40px}.cookie-settings-head{padding:16px}.cookie-settings-head h2{font-size:20px}.cookie-row{padding:14px 16px}.cookie-settings-actions{padding:14px}}
      @media (max-height:520px){.cookie-choice-bar{bottom:max(8px,env(safe-area-inset-bottom));max-height:calc(100dvh - 16px);gap:10px;padding:12px}.cookie-choice-bar button{min-height:40px}.cookie-settings-modal{padding:8px}.cookie-settings-panel{max-height:calc(100dvh - 16px)}}
      @media (max-width:640px){.cookie-row{grid-template-columns:32px 1fr;align-items:start}.cookie-row .cookie-status,.cookie-row .cookie-switch{grid-column:2}.cookie-settings-actions{display:grid;grid-template-columns:1fr;gap:10px}.cookie-settings-actions button{width:100%}}
      `;
      document.head.appendChild(style);
    }
    const bar = document.createElement('section');
    bar.id = 'cookie-choice-bar';
    bar.className = 'cookie-choice-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', '本地 Cookie 选择');
    bar.innerHTML = `
      <p><strong>本地 Cookie 使用说明</strong>地震数据监控仅用必要 Cookie 记录您的 Cookie 选择和导览状态；系统推送设置、地图源、主题和关注地区保存在浏览器本机加密存储中，不会随每次请求发送。本站不使用广告、营销或第三方分析 Cookie，不保存明文定位信息。清除站点数据后，网页会按新用户重新开始。</p>
      <div class="cookie-actions">
        <button type="button" class="manage">管理设置</button>
        <button type="button" class="decline">拒绝可选</button>
        <button type="button" class="accept">全部接受</button>
      </div>
    `;
    document.body.appendChild(bar);
    const modal = document.createElement('section');
    modal.className = 'cookie-settings-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Cookie 管理设置');
    modal.innerHTML = `
      <div class="cookie-settings-panel">
        <div class="cookie-settings-head">
          <h2>Cookie Settings</h2>
          <p>这里只显示本项目实际使用的 Cookie 和本机存储类型。您可以关闭本机功能存储，关闭后页面仍可使用，但地图源、主题和关注地区不会在下次打开时保留。</p>
        </div>
        <div class="cookie-row">
          <button type="button" aria-label="展开必要 Cookie 说明">+</button>
          <span><b>必要 Cookie</b><small>仅用于保存您对 Cookie 的选择和首次导览状态。该项始终启用，清除 Cookie 后会重新询问。</small></span>
          <span class="cookie-status">始终启用</span>
        </div>
        <div class="cookie-row">
          <button type="button" aria-label="展开本机功能 Cookie 说明">+</button>
          <span><b>本机功能存储</b><small>用于加密保存地图源、主题模式、关注地区等偏好，数据保存在本机，不进入请求头。</small></span>
          <label class="cookie-switch" aria-label="本机功能存储"><input type="checkbox" id="cookie-personalization" checked><span></span></label>
        </div>
        <div class="cookie-settings-actions">
          <button type="button" class="reject">全部拒绝</button>
          <button type="button" class="save">保存并接受</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    function finishChoice(choice) {
      setCookieChoice(choice);
      bar.classList.add('closing');
      modal.classList.add('closing');
      setTimeout(() => {
        bar.remove();
        modal.remove();
      }, 150);
    }
    modal.querySelectorAll('.cookie-row > button').forEach(button => {
      button.addEventListener('click', () => {
        const row = button.closest('.cookie-row');
        row.classList.toggle('open');
        button.textContent = row.classList.contains('open') ? '-' : '+';
      });
    });
    bar.querySelector('.manage').addEventListener('click', () => {
      modal.classList.add('show');
      modal.querySelector('#cookie-personalization').focus();
    });
    bar.querySelector('.accept').addEventListener('click', () => {
      finishChoice(true);
    });
    bar.querySelector('.decline').addEventListener('click', () => {
      finishChoice(false);
    });
    modal.querySelector('.reject').addEventListener('click', () => {
      finishChoice(false);
    });
    modal.querySelector('.save').addEventListener('click', () => {
      finishChoice({ personalization: modal.querySelector('#cookie-personalization').checked });
    });
  }

  const ready = (async () => {
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    injectChoiceBar();
    if (canEncrypt()) await key().catch(() => {});
    await migrateRequiredCookies().catch(() => {});
    await migrateLegacyOptionalCookies().catch(() => {});
  })();

  window.SecureStorage = {
    ready,
    getItem,
    setItem,
    getRequiredItem,
    setRequiredItem,
    removeItem,
    isCookieEnabled: canPersist,
    setCookieChoice,
    showCookieChoiceBar: () => injectChoiceBar(true)
  };
})();
