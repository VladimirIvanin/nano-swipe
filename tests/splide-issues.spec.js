import { test, expect } from '@playwright/test';
import { freezeClock } from './helpers/clock.js';

// Splide issue numbers are provenance, not assertions that every upstream
// report is a bug in a supported nano-swipe configuration. See reports/splide-issues.json.
async function mount(page, options = {}, { scale = 1, dialog = false, layout = '', count = 7 } = {}) {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.setContent(`<!doctype html><style>
    body{margin:0}.splide{width:600px}.splide__slide{height:100px}
    #host{transform:scale(${scale});transform-origin:top left}
    ${layout ? `#host{display:${layout};width:600px;${layout === 'grid' ? 'grid-template-columns:200px 1fr' : ''}}aside{width:200px;flex-shrink:0}.splide{width:auto;flex:1}.splide__slide a{white-space:nowrap}` : ''}
    </style>${dialog ? '<dialog id="modal">' : ''}<div id="host">${layout ? '<aside>Sidebar</aside>' : ''}<div class="splide" id="deck"><div class="splide__track"><div class="splide__list">${Array.from({ length: count }, (_, i) => `<div class="splide__slide" data-card="${i}"><a href="#${i}">${layout ? 'A long unbroken product title which must not force the entire carousel wider than its column' : `Card ${i}`}</a></div>`).join('')}</div></div></div></div>${dialog ? '</dialog>' : ''}`);
  await page.addStyleTag({ path: 'dist/nano-swipe.css' });
  await page.addScriptTag({ path: 'dist/nano-swipe.js' });
  await page.evaluate(options => { window.slider = new Splide('#deck', { perPage: 3, perMove: 1, speed: 0, ...options }).mount(); }, options);
}

const position = page => page.locator('.splide__list').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);

test('#211 — height-only resize does not reset a pending slide transition', async ({ page }) => {
  await freezeClock(page);
  await mount(page, { speed: 400 });
  await page.evaluate(() => {
    slider.go(2);
    const list = slider.Components.Elements.list;
    list.style.transition = 'none'; list.style.transform = 'translateX(-100px)';
  });
  await page.setViewportSize({ width: 900, height: 600 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  expect(await position(page)).toBe(-100);
  await page.clock.runFor(400);
  expect(await page.evaluate(() => slider.index)).toBe(2);
  expect(await position(page)).toBeCloseTo(-400, 0);
});

test('#211 — height-only resize does not snap the track away from the pointer', async ({ page }) => {
  await mount(page);
  await page.mouse.move(300, 60); await page.mouse.down();
  await page.mouse.move(200, 60, { steps: 5 });
  const before = await position(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  expect(await position(page)).toBeCloseTo(before, 0);
  await page.mouse.move(170, 60);
  expect(await position(page)).toBeCloseTo(before - 30, 0);
  await page.mouse.up();
});

for (const phase of ['pending', 'active']) {
  test(`#1350 — disabling drag cancels a ${phase} mouse gesture`, async ({ page }) => {
    await mount(page, { dragMinThreshold: { mouse: 10, touch: 10 } });
    await page.mouse.move(300, 60); await page.mouse.down();
    await page.mouse.move(phase === 'active' ? 240 : 297, 60);
    await page.evaluate(() => { slider.options = { drag: false }; });
    await page.mouse.move(80, 60, { steps: 6 }); await page.mouse.up();
    expect(await page.evaluate(() => slider.index)).toBe(0);
    expect(await position(page)).toBe(0);
    await page.evaluate(() => { slider.options = { drag: true }; });
    await page.mouse.move(300, 60); await page.mouse.down();
    await page.mouse.move(160, 60, { steps: 5 }); await page.mouse.up();
    expect(await page.evaluate(() => slider.index)).toBeGreaterThan(0);
  });
}

test('#1359 — a slide becoming hidden does not retain keyboard focus', async ({ page }) => {
  await mount(page);
  await page.locator('[data-card="0"] a').focus();
  await page.evaluate(() => slider.go(4));
  expect(await page.evaluate(() => !!document.activeElement.closest('.splide__slide[aria-hidden="true"]'))).toBe(false);
});

for (const scale of [0.5, 1.5]) {
  for (const focus of [0, 'center']) {
    test(`#1127 — ancestor scale ${scale} preserves ${focus} slide alignment`, async ({ page }) => {
      await mount(page, { type: 'loop', focus, gap: 16 }, { scale });
      for (const index of [1, 5, 6, 0]) {
        await page.evaluate(index => slider.go(index), index);
        const error = await page.evaluate(focus => {
          const track = slider.Components.Elements.track.getBoundingClientRect();
          const slide = slider.Components.Elements.slides[slider.index].getBoundingClientRect();
          return focus === 'center' ? (slide.left + slide.right - track.left - track.right) / 2 : slide.left - track.left;
        }, focus);
        expect(Math.abs(error)).toBeLessThan(1);
      }
    });
  }
  test(`#1127 — drag inside ancestor scale ${scale} follows the pointer in screen pixels`, async ({ page }) => {
    await mount(page, {}, { scale });
    const box = await page.locator('.splide__track').boundingBox();
    const x = box.x + box.width * 0.6, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x - 60, y, { steps: 5 });
    expect(await position(page)).toBeCloseTo(-60 / scale, 0);
    await page.mouse.up();
  });
}

for (const layout of ['flex', 'grid']) {
  test(`#1305 — ${layout} item shrinks to the available column width`, async ({ page }) => {
    await mount(page, {}, { layout });
    expect(await page.locator('#deck').evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(400, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(900);
  });
}

test('#1284 — opening a native dialog centers the current slide without a window resize', async ({ page }) => {
  await mount(page, { focus: 'center', trimSpace: false, start: 2 }, { dialog: true });
  await page.evaluate(() => document.querySelector('#modal').showModal());
  await expect.poll(() => page.evaluate(() => {
    const track = slider.Components.Elements.track.getBoundingClientRect();
    const slide = slider.Components.Elements.slides[2].getBoundingClientRect();
    return Math.abs((slide.left + slide.right - track.left - track.right) / 2);
  })).toBeLessThan(1);
  await page.evaluate(() => document.querySelector('#modal').close());
});

test('#1307 / #1134 — a destroy breakpoint restores all links to the tab order', async ({ page }) => {
  await mount(page, { breakpoints: { 600: { destroy: true } } });
  await expect(page.locator('.splide__slide[aria-hidden="true"] a').first()).toHaveAttribute('tabindex', '-1');
  await page.setViewportSize({ width: 500, height: 700 });
  await expect.poll(() => page.evaluate(() => slider.state.is(Splide.STATES.DESTROYED))).toBe(true);
  expect(await page.locator('.splide__slide a').evaluateAll(links => links.every(link => link.tabIndex === 0))).toBe(true);
  await expect(page.locator('.splide__slide[aria-hidden]')).toHaveCount(0);
});

test('#1257 — keyboard navigation reverses direction at both ends', async ({ page }) => {
  await mount(page, { perPage: 1, keyboard: 'focused' });
  await page.locator('.splide__arrow--next').focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => slider.index)).toBe(6);
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => slider.index)).toBe(5);
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => slider.index)).toBe(1);
});

test('#1359 / #1257 — focused keyboard navigation continues after the focused slide moves offscreen', async ({ page }) => {
  await mount(page, { perPage: 1, keyboard: 'focused' });
  await page.locator('[data-card="0"] a').focus();
  for (let i = 1; i <= 3; i++) {
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => slider.index)).toBe(i);
    await expect(page.locator(`[data-card="${i}"]`)).toBeFocused();
  }
});

test('#781 — releasing the mouse above an arrow leaves no sticky drag', async ({ page }) => {
  await mount(page);
  await page.locator('.splide__arrows').evaluate(el => { el.style.cssText = 'position:absolute;left:60px;top:40px;z-index:3'; });
  await page.mouse.move(400, 60); await page.mouse.down();
  await page.mouse.move(80, 60, { steps: 10 }); await page.mouse.up();
  const after = await position(page), index = await page.evaluate(() => slider.index);
  await page.mouse.move(300, 60);
  expect(await position(page)).toBeCloseTo(after, 0);
  expect(await page.evaluate(() => slider.index)).toBe(index);
});

test('#1255 — initial loop layout with padding and gap is stable after refresh', async ({ page }) => {
  await mount(page, { type: 'loop', perPage: 1, padding: 181, gap: 24, drag: false });
  const geometry = () => page.locator('.splide__slide').evaluateAll(slides => slides.map(el => ({ left: el.getBoundingClientRect().left, width: el.getBoundingClientRect().width })));
  const before = await geometry();
  await page.evaluate(() => slider.refresh());
  expect(await geometry()).toEqual(before);
});

test('#1260 — slide mode keeps ID-bound checkbox labels attached to the visible input', async ({ page }) => {
  await mount(page, { type: 'slide', perPage: 1 });
  await page.evaluate(() => {
    slider.Components.Elements.slides.forEach((slide, i) => { slide.innerHTML = `<input type="checkbox" id="choice-${i}"><label for="choice-${i}">Choice ${i}</label>`; });
    slider.refresh(); slider.go(2);
  });
  await page.locator('label[for="choice-2"]').click();
  await expect(page.locator('#choice-2')).toBeChecked();
  expect(await page.locator('[id^="choice-"]').evaluateAll(inputs => new Set(inputs.map(el => el.id)).size)).toBe(7);
});

for (const effect of ['scale:1.1', 'transform:translateX(14px) scale(1.1)']) {
  test(`#1347 — active slide ${effect} does not change the logical navigation stride`, async ({ page }) => {
    await mount(page, { type: 'loop', focus: 'center', gap: 16 });
    const indices = [1, 5, 6, 0, 3, 0];
    const sample = async () => {
      const positions = [];
      for (const index of indices) { await page.evaluate(index => slider.go(index), index); positions.push(await position(page)); }
      return positions;
    };
    const before = await sample();
    await page.addStyleTag({ content: `.splide__slide.is-active{${effect}}` });
    const after = await sample();
    after.forEach((value, i) => expect(value).toBeCloseTo(before[i], 1));
  });
}
