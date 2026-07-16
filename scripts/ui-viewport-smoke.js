const { chromium } = require('playwright');

const baseUrl = process.env.UI_TEST_BASE_URL || 'http://127.0.0.1:3000';
const debugPassword = String(process.env.UI_TEST_PASSWORD || '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertMapOverlaySafety(page, label, expectDetailFallback) {
  await page.waitForTimeout(250);
  const result = await page.locator('#desktop-map-stage').evaluate((stage, detailFallback) => {
    const metrics = stage.querySelector('.map-metrics');
    const focus = stage.querySelector('.map-focus-controls');
    const detail = document.querySelector('.detail-map-fallback');
    const rect = element => {
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const stageRect = rect(stage);
    const metricsRect = rect(metrics);
    const focusRect = rect(focus);
    const metricsStyle = getComputedStyle(metrics);
    const detailStyle = detail ? getComputedStyle(detail) : null;
    const sourcePositions = {};
    for (const source of ['amap', 'tianditu', 'google', 'yandex', 'osm', 'esri']) {
      stage.dataset.mapSource = source;
      const current = rect(metrics);
      sourcePositions[source] = { left: current.left, top: current.top, width: current.width };
    }
    return {
      layout: stage.dataset.metricsLayout,
      stage: stageRect,
      metrics: metricsRect,
      focus: focusRect,
      metricsDisplay: metricsStyle.display,
      detailDisplay: detailStyle ? detailStyle.display : 'none',
      overlap: metricsStyle.display !== 'none' && intersects(metricsRect, focusRect),
      sourcePositions,
      expectDetailFallback: detailFallback
    };
  }, expectDetailFallback);
  if (expectDetailFallback) {
    assert(result.layout === 'detail', `${label}: 窄地图未切换到地震详情布局`);
    assert(result.metricsDisplay === 'none', `${label}: 窄地图仍显示地图指标气泡`);
    assert(result.detailDisplay !== 'none', `${label}: 地震详情未显示坐标和传播半径`);
  } else {
    assert(result.layout === 'overlay', `${label}: 地图空间足够时错误隐藏了指标气泡`);
    assert(result.metricsDisplay !== 'none', `${label}: 地图指标气泡不可见`);
    assert(result.metrics.left >= result.stage.left && result.metrics.right <= result.stage.right + 1, `${label}: 地图指标超出地图区域`);
    assert(!result.overlap, `${label}: 地图指标与震中/我的按钮相交`);
    const positions = Object.values(result.sourcePositions);
    assert(positions.every(position => Math.abs(position.left - positions[0].left) < 1 && Math.abs(position.top - positions[0].top) < 1 && Math.abs(position.width - positions[0].width) < 1), `${label}: 不同地图源的指标气泡位置不一致`);
  }
  assert(result.focus.left >= result.stage.left && result.focus.right <= result.stage.right + 1, `${label}: 震中/我的按钮超出地图区域`);
  return result;
}

async function assertPanelWithinViewport(page, label) {
  const panel = page.locator('#desktop-debug-floating-panel');
  await panel.waitFor({ state: 'visible' });
  const result = await panel.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const handle = element.querySelector('.debug-panel-handle');
    const title = handle && handle.querySelector('span');
    const status = handle && handle.querySelector('small');
    const titleRect = title && title.getBoundingClientRect();
    const statusRect = status && status.getBoundingClientRect();
    const drawer = document.querySelector('#desktop-settings-drawer');
    const drawerStyle = drawer ? getComputedStyle(drawer) : null;
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.visualViewport ? window.visualViewport.width : window.innerWidth,
      viewportHeight: window.visualViewport ? window.visualViewport.height : window.innerHeight,
      zIndex: Number(style.zIndex),
      drawerZIndex: drawerStyle ? Number(drawerStyle.zIndex) : 0,
      drawerHidden: drawer ? drawer.getAttribute('aria-hidden') === 'true' : true,
      ariaHidden: element.getAttribute('aria-hidden'),
      handleOverflow: handle ? handle.scrollWidth > handle.clientWidth + 1 : true,
      titleStatusOverlap: Boolean(titleRect && statusRect && titleRect.bottom > statusRect.top + 1),
      titleSingleLine: title ? getComputedStyle(title).whiteSpace === 'nowrap' : false
    };
  });
  assert(result.ariaHidden === 'false', `${label}: 调试面板的可访问状态错误`);
  assert(result.left >= 0 && result.top >= 0, `${label}: 调试面板超出视口左侧或顶部`);
  assert(result.right <= result.viewportWidth + 1, `${label}: 调试面板超出视口右侧`);
  assert(result.bottom <= result.viewportHeight + 1, `${label}: 调试面板超出视口底部`);
  assert(result.width >= 220 && result.height >= 120, `${label}: 调试面板尺寸异常`);
  assert(result.drawerHidden, `${label}: 设置抽屉未在调试面板开启后关闭`);
  assert(result.zIndex > result.drawerZIndex, `${label}: 调试面板层级不高于设置抽屉`);
  assert(!result.handleOverflow, `${label}: 调试面板标题栏横向溢出`);
  assert(!result.titleStatusOverlap, `${label}: 调试工具标题与状态文字重叠`);
  assert(result.titleSingleLine, `${label}: 调试工具标题被异常拆行`);
  return result;
}

async function assertObsWithinViewport(page) {
  const result = await page.locator('.obs-shell').evaluate(shell => {
    const alert = shell.querySelector('.obs-alert');
    const clock = shell.querySelector('#current-time');
    const lastDetail = alert && alert.querySelector('dl > div:last-child');
    const rect = element => {
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom };
    };
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      shell: rect(shell),
      alert: rect(alert),
      clock: rect(clock),
      lastDetail: rect(lastDetail),
      alertClientHeight: alert.clientHeight,
      alertScrollHeight: alert.scrollHeight
    };
  });
  assert(result.shell.right <= result.viewportWidth + 1 && result.shell.bottom <= result.viewportHeight + 1, 'OBS 外框超出桌面视口');
  assert(result.alert.right <= result.viewportWidth + 1 && result.clock.right <= result.viewportWidth + 1, 'OBS 右侧面板或时钟被横向裁切');
  assert(result.lastDetail.bottom <= result.alert.bottom + 1, `OBS 右侧最后一行详情不可见: ${JSON.stringify(result)}`);
  assert(result.alertScrollHeight <= result.alertClientHeight + 1, `OBS 右侧面板仍需要滚动才能完整显示: ${JSON.stringify(result)}`);
  return result;
}

async function main() {
  assert(debugPassword, '缺少 UI_TEST_PASSWORD，无法验证调试面板');
  const executablePath = String(process.env.UI_TEST_BROWSER_PATH || '').trim();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {})
  });
  try {
    const page = await browser.newPage({ viewport: { width: 920, height: 500 } });
    let pushTestRequests = 0;
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/push/test') pushTestRequests += 1;
    });
    await page.goto(`${baseUrl}/?desktop=1`, { waitUntil: 'domcontentloaded' });
    const cookieChoice = page.locator('#cookie-choice-bar .decline');
    if (await cookieChoice.isVisible().catch(() => false)) {
      await cookieChoice.click();
      await page.locator('#cookie-choice-bar').waitFor({ state: 'detached' });
    }
    await page.waitForTimeout(500);
    const guideSkip = page.locator('[data-guide="skip"]');
    if (await guideSkip.isVisible().catch(() => false)) {
      await guideSkip.click();
      await page.locator('.guide-overlay').waitFor({ state: 'detached' });
    }
    const mapMedium = await assertMapOverlaySafety(page, '920x500 map', false);
    const settingsButton = page.locator('#desktop-settings-open-compact:visible, #desktop-settings-open:visible').first();
    await settingsButton.click();
    assert(await page.locator('#desktop-obs-toggle').count() === 0, '桌面设置仍包含 OBS 客户端开关');
    await page.locator('#desktop-debug-enable').click();
    await page.locator('#desktop-debug-password').fill(debugPassword);
    await page.locator('#desktop-debug-confirm').click();
    const medium = await assertPanelWithinViewport(page, '920x500');
    await page.locator('#desktop-debug-float-add-history').click();
    await page.locator('#desktop-message-dialog.show').waitFor({ state: 'visible' });
    assert(await page.locator('#desktop-event-list [data-event-key^="event:debug-"][class*="active"]').count() === 1, '测试地震未写入网页并设为当前选中事件');
    await page.locator('#desktop-message-close').click();
    await page.locator('#desktop-debug-float-test-notification').click();
    await page.locator('#desktop-message-dialog.show').waitFor({ state: 'visible' });
    assert((await page.locator('#desktop-message-text').textContent()).includes('HTTPS'), 'HTTP 测试环境未正确阻止本机通知');
    assert(pushTestRequests === 0, '不安全 HTTP 环境仍向服务端提交了推送请求');
    await page.locator('#desktop-message-close').click();

    await page.setViewportSize({ width: 480, height: 340 });
    await page.waitForTimeout(250);
    const mapCompact = await assertMapOverlaySafety(page, '480x340 map', true);
    const compact = await assertPanelWithinViewport(page, '480x340');

    await page.evaluate(() => {
      const panel = document.querySelector('#desktop-debug-floating-panel');
      if (panel) {
        panel.style.left = '9999px';
        panel.style.top = '9999px';
      }
    });
    const reopenButton = page.locator('#desktop-settings-open-compact:visible, #desktop-settings-open:visible').first();
    await reopenButton.click();
    await page.locator('#desktop-debug-enable').click();
    const recovered = await assertPanelWithinViewport(page, 'recovered');

    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    let mobilePushTestRequests = 0;
    mobilePage.on('request', request => {
      if (new URL(request.url()).pathname === '/push/test') mobilePushTestRequests += 1;
    });
    await mobilePage.goto(`${baseUrl}/mobile.html`, { waitUntil: 'domcontentloaded' });
    const mobileCookieChoice = mobilePage.locator('#cookie-choice-bar .decline');
    if (await mobileCookieChoice.isVisible().catch(() => false)) {
      await mobileCookieChoice.click();
      await mobilePage.locator('#cookie-choice-bar').waitFor({ state: 'detached' });
    }
    await mobilePage.waitForTimeout(500);
    const mobileGuideSkip = mobilePage.locator('[data-guide="skip"]');
    if (await mobileGuideSkip.isVisible().catch(() => false)) {
      await mobileGuideSkip.click();
      await mobilePage.locator('.guide-overlay').waitFor({ state: 'detached' });
    }
    await mobilePage.locator('#mobile-menu-open').click();
    assert(await mobilePage.locator('#mobile-notification-toggle').count() === 1, '手机版设置缺少后台推送开关');
    assert(await mobilePage.locator('#mobile-notification-status').count() === 1, '手机版设置缺少后台推送状态');
    assert(await mobilePage.locator('#mobile-notification-settings-panel').count() === 1, '手机版设置缺少推送条件面板');
    await mobilePage.locator('#mobile-debug-enable').click();
    await mobilePage.locator('#mobile-debug-password').fill(debugPassword);
    await mobilePage.locator('#mobile-debug-confirm').click();
    await mobilePage.locator('#mobile-menu-open').click();
    await mobilePage.locator('#mobile-debug-add-history').click();
    await mobilePage.locator('#mobile-message-dialog.show').waitFor({ state: 'visible' });
    assert(await mobilePage.locator('#mobile-event-list [data-key^="event:debug-"][class*="active"]').count() === 1, '手机版测试地震未写入网页并设为当前选中事件');
    await mobilePage.locator('#mobile-message-close').click();
    await mobilePage.locator('#mobile-debug-test-notification').click();
    await mobilePage.locator('#mobile-message-dialog.show').waitFor({ state: 'visible' });
    assert((await mobilePage.locator('#mobile-message-text').textContent()).includes('HTTPS'), '手机版 HTTP 测试环境未正确阻止本机通知');
    assert(mobilePushTestRequests === 0, '手机版不安全 HTTP 环境仍向服务端提交了推送请求');
    await mobilePage.close();

    const obsPage = await browser.newPage({ viewport: { width: 2048, height: 935 } });
    await obsPage.goto(`${baseUrl}/obs?theme=light`, { waitUntil: 'domcontentloaded' });
    await obsPage.waitForTimeout(500);
    const obs = await assertObsWithinViewport(obsPage);
    await obsPage.close();

    console.log(JSON.stringify({ ok: true, mapMedium, mapCompact, medium, compact, recovered, obs, mobileNotifications: true }));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
