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
  await expect(page.locator('#options-body tr')).toHaveCount(27);
  await expect(page.locator('[data-code="noDrag"]')).toContainText("noDrag: '.zoomix-touch, .zoomix-touch *'");
  await expect(page.locator('[data-js-size]')).not.toHaveText('—');
  const response = await request.get('/docs-meta.json');
  const meta = await response.json();
  expect(meta.jsGzip).toBeLessThanOrEqual(5632);
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
