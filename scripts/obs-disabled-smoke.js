'use strict';

const baseUrl = String(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const configResponse = await fetch(`${baseUrl}/config`);
  const config = await configResponse.json();
  assert(configResponse.status === 200, '客户端配置接口异常');
  assert(config.obsEnabled === false, '服务器未向客户端公开 OBS 已关闭状态');

  for (const pathname of ['/obs', '/obs.html']) {
    const response = await fetch(`${baseUrl}${pathname}`, { redirect: 'manual' });
    assert(response.status === 404, `${pathname} 在 OBS 关闭时仍可访问`);
  }

  console.log('OBS server control smoke passed.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
