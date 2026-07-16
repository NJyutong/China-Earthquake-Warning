const crypto = require('crypto');
const { assetVersion } = require('./version');

const origins = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['https://www.cnquake.xyz', 'https://cnquake.xyz'];

(async () => {
  let failed = false;
  for (const rawOrigin of origins) {
    const origin = String(rawOrigin).replace(/\/+$/, '');
    for (let sample = 1; sample <= 3; sample += 1) {
      for (const route of ['/health', '/?desktop=1', '/mobile']) {
        const separator = route.includes('?') ? '&' : '?';
        const url = `${origin}${route}${separator}release-check=${Date.now()}-${sample}`;
        try {
          const response = await fetch(url, {
            redirect: 'follow',
            headers: {
              'user-agent': route === '/mobile'
                ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
                : 'Mozilla/5.0 CodexReleaseCheck/1.0',
              'cache-control': 'no-cache, no-store',
              pragma: 'no-cache'
            }
          });
          const body = Buffer.from(await response.arrayBuffer());
          const text = body.toString('utf8');
          const versions = route === '/health'
            ? [JSON.parse(text).version]
            : [...text.matchAll(/(?:i18n|styles|mobile|obs|shared|secure-storage|voice-alert|official-map|app)\.(?:css|js)\?v=([^"']+)/g)].map(match => match[1]);
          const matches = response.ok && versions.length > 0 && versions.every(version => version === assetVersion);
          failed ||= !matches;
          console.log(JSON.stringify({
            origin,
            sample,
            route,
            status: response.status,
            matches,
            versions: [...new Set(versions)],
            cfCache: response.headers.get('cf-cache-status'),
            cfRay: response.headers.get('cf-ray'),
            age: response.headers.get('age'),
            cacheControl: response.headers.get('cache-control'),
            bytes: body.length,
            sha256: crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)
          }));
        } catch (error) {
          failed = true;
          console.log(JSON.stringify({ origin, sample, route, matches: false, error: error.message }));
        }
      }
    }
  }
  if (failed) process.exitCode = 1;
})();
