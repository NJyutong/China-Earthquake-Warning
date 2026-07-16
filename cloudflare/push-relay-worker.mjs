const RELAY_VERSION = 'r1.1';
const MAX_REQUEST_BYTES = 24 * 1024;
const MAX_PUSH_BODY_BYTES = 8 * 1024;
const ALLOWED_HEADER_NAMES = new Set([
  'authorization',
  'content-encoding',
  'content-type',
  'crypto-key',
  'encryption',
  'topic',
  'ttl',
  'urgency'
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'cnquake-push-relay', version: RELAY_VERSION });
    }
    if (request.method !== 'POST') return json({ ok: false, code: 'method_not_allowed', requestId, message: 'Method not allowed' }, 405);

    const relaySecret = String(env.PUSH_RELAY_SECRET || '');
    const timestamp = String(request.headers.get('x-cnquake-timestamp') || '');
    const signature = String(request.headers.get('x-cnquake-signature') || '').toLowerCase();
    const timestampNumber = Number(timestamp);
    if (relaySecret.length < 32 || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - timestampNumber) > 90 || !/^[a-f0-9]{64}$/.test(signature)) {
      return json({ ok: false, code: 'unauthorized', requestId, message: 'Unauthorized' }, 401);
    }

    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_REQUEST_BYTES) return json({ ok: false, code: 'request_too_large', requestId, message: 'Request too large' }, 413);
    const rawBody = await request.text();
    if (rawBody.length > MAX_REQUEST_BYTES) return json({ ok: false, code: 'request_too_large', requestId, message: 'Request too large' }, 413);
    const expectedSignature = await hmacHex(relaySecret, `${timestamp}.${rawBody}`);
    if (!constantTimeEqual(signature, expectedSignature)) return json({ ok: false, code: 'unauthorized', requestId, message: 'Unauthorized' }, 401);

    let input;
    try {
      input = JSON.parse(rawBody);
    } catch (_error) {
      return json({ ok: false, code: 'invalid_json', requestId, message: 'Invalid JSON' }, 400);
    }

    if (url.pathname === '/diagnostics' && input && input.probe === true) {
      return json({
        ok: true,
        service: 'cnquake-push-relay',
        version: RELAY_VERSION,
        authenticated: true,
        requestId
      });
    }

    const endpoint = normalizePushEndpoint(input && input.endpoint);
    if (!endpoint) return json({ ok: false, code: 'endpoint_not_allowed', requestId, message: 'Push endpoint is not allowed' }, 403);
    const headers = sanitizePushHeaders(input && input.headers);
    if (!headers) return json({ ok: false, code: 'invalid_headers', requestId, message: 'Push headers are invalid' }, 400);

    let body;
    try {
      body = decodeBase64(input && input.body);
    } catch (_error) {
      return json({ ok: false, code: 'invalid_body', requestId, message: 'Push body is invalid' }, 400);
    }
    if (body.byteLength > MAX_PUSH_BODY_BYTES) return json({ ok: false, code: 'push_body_too_large', requestId, message: 'Push body is too large' }, 413);

    const provider = pushProvider(endpoint);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        cache: 'no-store',
        redirect: 'manual'
      });
      const responseBody = (await response.text()).slice(0, 2048);
      return json({
        ok: response.ok,
        status: response.status,
        body: responseBody,
        provider,
        diagnostics: providerDiagnostics(response.headers),
        requestId
      });
    } catch (error) {
      console.error(JSON.stringify({
        event: 'push_provider_error',
        requestId,
        provider,
        errorName: safeLogValue(error && error.name, 40),
        errorCode: safeLogValue(error && error.code, 64)
      }));
      return json({
        ok: false,
        code: 'provider_connection_failed',
        provider,
        requestId,
        message: 'Push provider connection failed'
      }, 502);
    }
  }
};

function pushProvider(endpoint) {
  const hostname = new URL(endpoint).hostname.toLowerCase();
  if (hostname === 'fcm.googleapis.com' || hostname.endsWith('.fcm.googleapis.com') || hostname === 'android.googleapis.com') return 'fcm';
  if (hostname === 'updates.push.services.mozilla.com' || hostname.endsWith('.push.services.mozilla.com')) return 'mozilla';
  if (hostname === 'web.push.apple.com' || hostname.endsWith('.push.apple.com')) return 'apple';
  if (hostname.endsWith('.notify.windows.com') || hostname.endsWith('.wns.windows.com')) return 'wns';
  return 'unknown';
}

function providerDiagnostics(headers) {
  const names = [
    'x-wns-status',
    'x-wns-deviceconnectionstatus',
    'x-wns-notificationstatus',
    'x-wns-error-description',
    'x-wns-msg-id'
  ];
  const output = {};
  for (const name of names) {
    const value = safeLogValue(headers.get(name), 160);
    if (value) output[name] = value;
  }
  return output;
}

function safeLogValue(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function normalizePushEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return '';
    if (url.port && url.port !== '443') return '';
    if (!isAllowedPushHost(hostname)) return '';
    return url.href;
  } catch (_error) {
    return '';
  }
}

function isAllowedPushHost(hostname) {
  return hostname === 'fcm.googleapis.com' ||
    hostname.endsWith('.fcm.googleapis.com') ||
    hostname === 'android.googleapis.com' ||
    hostname === 'updates.push.services.mozilla.com' ||
    hostname.endsWith('.push.services.mozilla.com') ||
    hostname === 'web.push.apple.com' ||
    hostname.endsWith('.push.apple.com') ||
    hostname.endsWith('.notify.windows.com') ||
    hostname.endsWith('.wns.windows.com');
}

function sanitizePushHeaders(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const headers = new Headers();
  for (const [name, value] of Object.entries(input)) {
    const normalizedName = String(name || '').toLowerCase();
    const normalizedValue = String(value == null ? '' : value);
    if (!ALLOWED_HEADER_NAMES.has(normalizedName)) continue;
    if (!normalizedValue || normalizedValue.length > 4096 || /[\r\n]/.test(normalizedValue)) return null;
    headers.set(normalizedName, normalizedValue);
  }
  if (!headers.has('authorization') || !headers.has('content-encoding') || !headers.has('ttl')) return null;
  headers.set('content-type', headers.get('content-type') || 'application/octet-stream');
  return headers;
}

function decodeBase64(value) {
  const source = String(value || '');
  if (!source || source.length > Math.ceil(MAX_PUSH_BODY_BYTES * 4 / 3) + 4) throw new Error('invalid body');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(source)) throw new Error('invalid body');
  const binary = atob(source);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left || ''));
  const rightBytes = new TextEncoder().encode(String(right || ''));
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

async function hmacHex(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('');
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
