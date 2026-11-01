import { test, expect } from '@playwright/test';

async function load(page) {
  await page.setContent('<style>.splide{width:400px}.splide__slide{height:100px;width:120px}</style><div id="deck" class="splide"><div class="splide__track"><div class="splide__list">'+Array.from({ length: 5 }, (_, i) => `<div class="splide__slide">${i}</div>`).join('')+'</div></div></div>');
  await page.addStyleTag({ path: 'dist/nano-swipe.css' });
  await page.addScriptTag({ path: 'dist/nano-swipe.js' });
}

for (const options of [{ perPage: 2.5 }, { perPage: Infinity }, { clones: 1.5 }, { clones: -1 }, { flickMaxPages: Infinity }]) {
  test(`invalid ${Object.keys(options)[0]}=${String(Object.values(options)[0])} is rejected before mount changes the DOM`, async ({ page }) => {
    await load(page);
    const before = await page.locator('#deck').evaluate(el => el.outerHTML);
    await expect(page.evaluate(options => { window.slider = new Splide('#deck', { type: 'loop', ...options }).mount(); }, options)).rejects.toThrow(Object.keys(options)[0]);
    expect(await page.locator('#deck').evaluate(el => el.outerHTML)).toBe(before);
  });
}

test('a rejected options update leaves options, geometry and future refresh unchanged', async ({ page }) => {
  await load(page);
  await page.evaluate(() => { window.slider = new Splide('#deck', { speed: 0, perPage: 2 }).mount(); slider.go(2); });
  const before = await page.evaluate(() => [slider.index, slider.options.perPage, slider.options.gap, slider.Components.Elements.list.style.transform]);
  await expect(page.evaluate(() => { slider.options = { perPage: 2.5, gap: 99 }; })).rejects.toThrow('perPage');
  await page.evaluate(() => slider.refresh());
  expect(await page.evaluate(() => [slider.index, slider.options.perPage, slider.options.gap, slider.Components.Elements.list.style.transform])).toEqual(before);
});

for (const [key, value] of [['type', 'loop'], ['autoWidth', true]]) {
  test(`changing readonly ${key} after mount reports a useful error without partial updates`, async ({ page }) => {
    await load(page);
    await page.evaluate(() => { window.slider = new Splide('#deck', { speed: 0 }).mount(); });
    await expect(page.evaluate(({ key, value }) => { slider.options = { [key]: value, gap: 50 }; }, { key, value })).rejects.toThrow(key);
    expect(await page.evaluate(() => [slider.options.type, !!slider.options.autoWidth, slider.options.gap])).toEqual(['slide', false, undefined]);
    await page.evaluate(() => slider.go(1));
    expect(await page.evaluate(() => slider.index)).toBe(1);
  });

  test(`readonly ${key} cannot change at an inactive breakpoint`, async ({ page }) => {
    await load(page);
    await expect(page.evaluate(({ key, value }) => new Splide('#deck', { breakpoints: { 100: { [key]: value } } }).mount(), { key, value })).rejects.toThrow(key);
    await expect(page.locator('.splide__slide--clone, .splide__pagination, .splide__arrows')).toHaveCount(0);
  });
}

test('readonly modes may be changed while destroyed and then mounted cleanly', async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    window.slider = new Splide('#deck', { speed: 0 }).mount(); slider.destroy();
    slider.options = { type: 'loop', autoWidth: true }; slider.mount(); slider.go('<');
  });
  expect(await page.evaluate(() => [slider.index, slider.options.type, slider.options.autoWidth])).toEqual([4, 'loop', true]);
  await expect(page.locator('.splide__slide--clone')).not.toHaveCount(0);
});

test('numeric string perPage is normalized before navigation arithmetic', async ({ page }) => {
  await load(page);
  await page.evaluate(() => { window.slider = new Splide('#deck', { speed: 0, type: 'loop', perPage: '2' }).mount(); slider.go('>'); slider.go('>'); });
  expect(await page.evaluate(() => [slider.options.perPage, slider.index])).toEqual([2, 4]);
});

test('fractional flickMaxPages produces an integer clone buffer', async ({ page }) => {
  await load(page);
  await page.evaluate(() => { window.slider = new Splide('#deck', { type: 'loop', speed: 0, perPage: 3, perMove: 1, flickMaxPages: 0.25 }).mount(); slider.go('<'); });
  expect(await page.evaluate(() => slider.index)).toBe(4);
  await expect(page.locator('.splide__slide--clone')).toHaveCount(8);
});

test('changing flickMaxPages or clones rebuilds the loop buffer', async ({ page }) => {
  await load(page);
  await page.evaluate(() => { window.slider = new Splide('#deck', { type: 'loop', speed: 0, perPage: 3, perMove: 1, flickMaxPages: 0.25 }).mount(); });
  await expect(page.locator('.splide__slide--clone')).toHaveCount(8);
  await page.evaluate(() => { slider.options = { flickMaxPages: 2 }; });
  await expect(page.locator('.splide__slide--clone')).toHaveCount(18);
  await page.evaluate(() => { slider.options = { clones: '5' }; slider.go('<'); });
  await expect(page.locator('.splide__slide--clone')).toHaveCount(10);
  expect(await page.evaluate(() => [slider.options.clones, slider.index])).toEqual([5, 4]);
});
