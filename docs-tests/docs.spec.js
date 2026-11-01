import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#demo-lifecycle')).toHaveClass(/is-initialized/);
  expect(errors).toEqual([]);
});

test('eight working demos, API, sizes and downloadable assets', async ({ page, request }) => {
  await expect(page.locator('.demo')).toHaveCount(8);
  await expect(page.locator('body')).not.toContainText(/InSales|инсейлс|Splide\s+3/i);
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', /InSales|Splide\s+3/i);
  await expect(page.locator('.demo .splide.is-initialized')).toHaveCount(8);
  await expect(page.locator('#options-body tr')).toHaveCount(30);
  await expect(page.locator('[data-code="noDrag"]')).toContainText("noDrag: '.zoomix-touch, .zoomix-touch *'");
  await expect(page.locator('[data-js-size]')).not.toHaveText('—');
  const response = await request.get('/docs-meta.json');
  const meta = await response.json();
  expect(meta.jsGzip).toBeLessThanOrEqual(7168);
  for (const file of ['nano-swipe.js', 'nano-swipe.css', 'nano-swipe.mjs']) {
    const response = await request.get(`/${file}`);
    expect(response.ok()).toBe(true);
    expect((await response.body()).length).toBeGreaterThan(100);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('arrows, pagination and responsive settings operate on the actual library', async ({ page }) => {
  await page.locator('#single .splide__arrow--next').click();
  await expect(page.locator('#single .demo-output')).toContainText('2 / 6');
  await page.locator('#single .splide__pagination__page').nth(3).click();
  await expect(page.locator('#single .demo-output')).toContainText('4 / 6');
  await page.setViewportSize({ width: 500, height: 800 });
  await expect(page.locator('#responsive .demo-output')).toContainText('perPage 1');
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator('#responsive .demo-output')).toContainText('perPage 3');
});

test('dynamic slides and lifecycle remain interactive after remount', async ({ page }) => {
  await page.locator('#add-slide').click();
  await expect(page.locator('#dynamic .demo-output')).toContainText('/ 7');
  await page.locator('#remove-slide').click();
  await expect(page.locator('#dynamic .demo-output')).toContainText('/ 6');
  await page.locator('#destroy-slider').click();
  await expect(page.locator('#lifecycle .demo-output')).toHaveText('Слайдер выключен');
  await expect(page.locator('#mount-slider')).toBeEnabled();
  await page.locator('#mount-slider').click();
  await expect(page.locator('#destroy-slider')).toBeEnabled();
  await page.locator('#lifecycle .splide__arrow--next').click();
  await expect(page.locator('#lifecycle .demo-output')).toContainText('2 / 6');
});

test('code tabs support keyboard navigation and copy the visible snippet', async ({ page }) => {
  const panel = page.locator('#single .code-panel');
  await panel.getByRole('tab', { name: 'HTML', exact: true }).click();
  await expect(panel.getByRole('tabpanel')).toContainText('id="demo-single"');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copied = text; } } }));
  await panel.getByRole('button', { name: 'Копировать' }).click();
  expect(await page.evaluate(() => copied)).toContain('id="demo-single"');
  await panel.getByRole('tab', { name: 'HTML', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByRole('tab', { name: 'CSS', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('tabpanel')).toContainText('background: #e8f1e7');
});

test('autoplay has a working explicit stop and restart button', async ({ page }) => {
  await page.locator('#toggle-autoplay').click();
  await expect(page.locator('#toggle-autoplay')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('#demo-autoplay').evaluate(root => root.splide.options.autoplay)).toBe(false);
  await page.locator('#toggle-autoplay').click();
  await expect(page.locator('#toggle-autoplay')).toHaveAttribute('aria-pressed', 'true');
});

test('native mobile swipes keep the multiple-slide demo responsive and allow page scroll', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium' || testInfo.project.name !== 'mobile', 'Native touch injection uses mobile Chromium CDP.');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#demo-multiple').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    window.touchDrags = 0;
    document.querySelector('#demo-multiple').splide.on('drag', () => touchDrags++);
  });
  const cdp = await page.context().newCDPSession(page);
  const track = page.locator('#demo-multiple .splide__track');
  for (let i = 0; i < 4; i++) {
    const previous = await page.locator('#demo-multiple').evaluate(root => root.splide.index);
    const box = await track.boundingBox();
    const x = box.x + box.width * 0.75, y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const dx of [12, 24, 40]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - dx, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await page.locator('#demo-multiple').evaluate(root => root.splide.index)).not.toBe(previous);
  }
  expect(await page.evaluate(() => touchDrags)).toBe(4);
  await expect.poll(() => page.locator('#demo-multiple').evaluate(root => root.splide.state.is(Splide.STATES.IDLE))).toBe(true);
  const previous = await page.locator('#demo-multiple').evaluate(root => root.splide.index);
  const scrollY = await page.evaluate(() => window.scrollY);
  const box = await track.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height * 0.8;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const dy of [25, 50, 80]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 2, y: y - dy }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollY);
  expect(await page.locator('#demo-multiple').evaluate(root => root.splide.index)).toBe(previous);
  expect(errors).toEqual([]);
  await cdp.detach();
});

test('centered mobile loop has no empty edge during fast repeated swipes', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium' || testInfo.project.name !== 'mobile', 'Native touch injection uses mobile Chromium CDP.');
  const root = page.locator('#demo-center');
  await root.scrollIntoViewIfNeeded();
  const cdp = await page.context().newCDPSession(page);
  for (const direction of [1, -1]) {
    await root.evaluate((root, direction) => {
      const slider = root.splide;
      slider.options = { speed: 0 };
      slider.go(direction > 0 ? slider.length - 1 : 0);
      slider.options = { speed: 400 };
      const coverage = window.coverage = { frames: 0, holes: [], moves: 0, running: true };
      slider.on('move.coverage', () => coverage.moves++);
      function sample() {
        if (!coverage.running) return;
        const box = slider.Components.Elements.track.getBoundingClientRect();
        const cards = [...slider.Components.Elements.list.children].map(card => card.getBoundingClientRect());
        const left = cards[0].left - box.left, right = box.right - cards.at(-1).right;
        if (left > 17 || right > 17) coverage.holes.push({ left, right, index: slider.index });
        coverage.frames++;
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, direction);
    const box = await root.locator('.splide__track').boundingBox();
    const x = box.x + (direction > 0 ? box.width - 12 : 12), y = box.y + box.height / 2;
    for (let i = 0; i < 5; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (const delta of [15, 55, 100, 150, 200]) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - direction * delta, y }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      // First inspect the almost-finished seam transition, then interrupt the
      // remaining transitions with new gestures instead of awaiting IDLE.
      await page.waitForTimeout(i === 0 ? 320 : 30);
    }
    await expect.poll(() => root.evaluate(root => root.splide.state.is(Splide.STATES.IDLE))).toBe(true);
    const result = await root.evaluate(root => {
      coverage.running = false;
      root.splide.off('move.coverage');
      return coverage;
    });
    expect(result.frames).toBeGreaterThan(10);
    expect(result.moves).toBe(5);
    expect(result.holes).toEqual([]);
  }
  await cdp.detach();
});
