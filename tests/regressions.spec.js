import { test, expect } from '@playwright/test';

async function mount(page, options = {}, width = 900) {
  await page.setViewportSize({ width, height: 700 });
  await page.setContent(`<!doctype html><style>body{margin:0}.splide{width:600px}.splide__slide{height:100px}</style>
    <div class="splide" id="deck"><div class="splide__track"><div class="splide__list">${Array.from({ length: 7 }, (_, i) => `<div class="splide__slide" data-card="${i}">${i}</div>`).join('')}</div></div></div>`);
  await page.addStyleTag({ path: 'dist/nano-swipe.css' });
  await page.addScriptTag({ path: 'dist/nano-swipe.js' });
  await page.evaluate(options => { window.slider = new Splide('#deck', { speed: 0, ...options }).mount(); }, options);
}

test('initial breakpoint destroy and explicit destroy leave static content visible', async ({ page }) => {
  await mount(page, { breakpoints: { 600: { destroy: true } } }, 500);
  await expect(page.locator('#deck')).toBeVisible();
  await expect.poll(() => page.evaluate(() => slider.state.is(Splide.STATES.DESTROYED))).toBe(true);
  await page.setViewportSize({ width: 900, height: 700 });
  await expect.poll(() => page.evaluate(() => slider.state.is(Splide.STATES.IDLE))).toBe(true);
  await page.evaluate(() => slider.destroy());
  await expect(page.locator('#deck')).toBeVisible();
  await expect(page.locator('.splide__slide')).toHaveCount(7);
});

test('focused pagination selects each slide with several cards per page', async ({ page }) => {
  await mount(page, { focus: 0, perPage: 3 });
  for (const index of [1, 2, 4, 0]) {
    await page.locator('.splide__pagination__page').nth(index).click();
    expect(await page.evaluate(() => slider.index)).toBe(index);
    await expect(page.locator('.splide__pagination__page').nth(index)).toHaveAttribute('aria-current', 'true');
  }
});

test('long slow row drag lands near the physical release position', async ({ page }) => {
  await mount(page, { perPage: 3, perMove: 1 });
  await page.mouse.move(550, 60); await page.mouse.down();
  await page.mouse.move(40, 60, { steps: 30 });
  await page.waitForTimeout(250); await page.mouse.up();
  expect(await page.evaluate(() => slider.index)).toBe(3);
  expect(await page.locator('[data-card="3"]').evaluate(el => el.getBoundingClientRect().left)).toBeCloseTo(0, 0);
});

test('interrupted loop crossing continues in the requested direction', async ({ page }) => {
  await mount(page, { type: 'loop', speed: 600, easing: 'linear', waitForTransition: false });
  const left = () => page.locator('[data-card="6"]').evaluateAll(elements => Math.max(...elements.map(el => el.getBoundingClientRect().left).filter(x => x < 600)));
  await page.evaluate(() => slider.go('<'));
  await page.waitForTimeout(100);
  const before = await left();
  await page.evaluate(() => slider.go('<'));
  await page.waitForTimeout(100);
  expect(await left()).toBeGreaterThan(before);
  await expect.poll(() => page.evaluate(() => slider.state.is(Splide.STATES.IDLE))).toBe(true);
  expect(await page.evaluate(() => slider.index)).toBe(5);
});

test('autoplay measures interval from transition start', async ({ page }) => {
  await mount(page, { type: 'loop', speed: 100, interval: 200, pauseOnHover: false, pauseOnFocus: false });
  await page.clock.install();
  await page.evaluate(() => {
    window.moves = 0; slider.on('move', () => moves++);
    slider.options = { autoplay: true };
  });
  await page.clock.runFor(850);
  expect(await page.evaluate(() => moves)).toBe(4);
});

test('outer updates preserve hidden inner controls and restore visible controls', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    slider.Components.Elements.slides[0].innerHTML = '<div class="splide" id="inner"><div class="splide__track"><div class="splide__list"><div class="splide__slide"><button>A</button></div><div class="splide__slide"><button>B</button></div></div></div></div>';
    window.innerSlider = new Splide('#inner', { speed: 0 }).mount();
    slider.options = { gap: 10 };
  });
  const buttons = page.locator('#inner .splide__slide button');
  await expect(buttons.nth(0)).not.toHaveAttribute('tabindex', '-1');
  await expect(buttons.nth(1)).toHaveAttribute('tabindex', '-1');
  await page.evaluate(() => { slider.go(1); slider.go(0); });
  await expect(buttons.nth(0)).not.toHaveAttribute('tabindex', '-1');
  await expect(buttons.nth(1)).toHaveAttribute('tabindex', '-1');
});

test('hidden auto perPage widget can mount and later receive numeric perPage', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    slider.destroy(); slider.root.style.display = 'none';
    slider = new Splide('#deck', { perPage: 'auto', speed: 0 }).mount();
    slider.root.style.display = ''; slider.options = { perPage: 3 }; slider.go(2);
  });
  expect(await page.evaluate(() => [slider.index, slider.length])).toEqual([2, 7]);
  expect(await page.locator('[data-card="2"]').evaluate(el => el.getBoundingClientRect().left)).toBeCloseTo(0, 0);
});
