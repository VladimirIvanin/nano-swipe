import { test, expect } from '@playwright/test';
import { freezeClock } from './helpers/clock.js';

// Adapted from tvist 5458032a407965d59dd64ef12f393ad75e31ea14:
// integration/{loop-basic,nested-slider-controls,product-cards-breakpoint,
// disabled-dom-pollution,review-regressions,autoplay-mobile-breakpoints}.test.ts;
// unit/modules/{PaginationLoopBug,NavigationModule.updateOptions,AutoplayModule}.test.ts.
// Use nano-swipe/Splide API and semantics, rather than tvist-specific modules.
const deck = (id, count, width = 600) => `<div id="${id}" class="splide" style="width:${width}px"><div class="splide__track"><div class="splide__list">${Array.from({ length: count }, (_, i) => `<div class="splide__slide" data-card="${i}"><a href="#${id}-${i}">Card ${i}</a></div>`).join('')}</div></div></div>`;

async function mount(page, options = {}, { count = 7, original = false, width = 900, nested = false, custom = false } = {}) {
  await page.setViewportSize({ width, height: 700 });
  await page.setContent(`<!doctype html><style>body{margin:0}.splide__slide{height:120px}button{height:24px}</style>${deck('deck', count)}`);
  if (nested) await page.locator('[data-card="0"]').first().evaluate((el, html) => { el.innerHTML = html; }, deck('inner', 3, 300));
  if (custom) await page.locator('#deck').evaluate(el => el.insertAdjacentHTML('beforeend', '<div class="author-controls"><div class="splide__arrows"><button class="splide__arrow--prev">Back</button><button class="splide__arrow--next">Forward</button></div></div>'));
  await page.addStyleTag({ path: original ? 'node_modules/@splidejs/splide/dist/css/splide-core.min.css' : 'dist/nano-swipe.css' });
  await page.addScriptTag({ path: original ? 'node_modules/@splidejs/splide/dist/js/splide.min.js' : 'dist/nano-swipe.js' });
  await page.evaluate(options => { window.slider = new Splide('#deck', { speed: 0, ...options }).mount(); }, options);
}

async function coverage(page) {
  return page.evaluate(() => {
    const { track, list } = slider.Components.Elements;
    const rect = track.getBoundingClientRect(), style = getComputedStyle(track);
    let edge = rect.left + parseFloat(style.paddingLeft);
    const end = rect.right - parseFloat(style.paddingRight), holes = [];
    for (const slide of [...list.children].map(el => el.getBoundingClientRect()).sort((a, b) => a.left - b.left)) {
      if (slide.right <= edge || slide.left >= end) continue;
      if (slide.left - edge > 17) holes.push(slide.left - edge);
      edge = Math.max(edge, slide.right);
    }
    if (end - edge > 17) holes.push(end - edge);
    return holes;
  });
}

for (const direction of ['>', '<']) {
  for (const focus of [undefined, 'center']) {
    test(`loop ${direction}, focus ${focus ?? 'default'}: 30 moves retain indices, events, pagination and coverage`, async ({ page }) => {
      await mount(page, { type: 'loop', perPage: 3, perMove: 1, gap: 16, focus });
      const states = await page.evaluate(direction => {
        const events = [];
        slider.on('moved', (index, old) => events.push([index, old]));
        return Array.from({ length: 30 }, () => {
          slider.go(direction);
          const { slides, list, track } = slider.Components.Elements;
          const viewport = track.getBoundingClientRect();
          let edge = viewport.left, covered = true;
          for (const rect of [...list.children].map(el => el.getBoundingClientRect()).sort((a, b) => a.left - b.left)) {
            if (rect.right <= edge || rect.left >= viewport.right) continue;
            if (rect.left - edge > 17) covered = false;
            edge = Math.max(edge, rect.right);
          }
          covered &&= edge >= viewport.right - 1;
          return { index: slider.index, event: events.at(-1), active: slides.filter(el => el.classList.contains('is-active')).map(el => +el.dataset.card), currentPages: slider.root.querySelectorAll('.splide__pagination__page[aria-current="true"]').length, covered };
        });
      }, direction);
      let old = 0;
      for (const state of states) {
        const next = (old + (direction === '>' ? 1 : 6)) % 7;
        expect(state).toEqual({ index: next, event: [next, old], active: [next], currentPages: 1, covered: true });
        old = next;
      }
      expect(await coverage(page)).toEqual([]);
    });
  }
}

test('pagination follows the same cards as Splide after two complete loop cycles', async ({ page }) => {
  const results = [];
  for (const original of [true, false]) {
    await mount(page, { type: 'loop', perPage: 3, perMove: 1 }, { original });
    results.push(await page.evaluate(() => Array.from({ length: 16 }, () => {
      slider.go('>');
      return { index: slider.index, activePage: [...slider.root.querySelectorAll('.splide__pagination__page')].findIndex(el => el.getAttribute('aria-current') === 'true') };
    })));
  }
  expect(results[1]).toEqual(results[0]);
});

test('removing the active last slide clamps the index and rebuilds controls', async ({ page }) => {
  await mount(page, { perPage: 3, perMove: 1 });
  await page.evaluate(() => {
    slider.go(4);
    slider.Components.Elements.slides.slice(4).forEach(el => el.remove());
    slider.refresh();
  });
  expect(await page.evaluate(() => [slider.index, slider.length])).toEqual([1, 4]);
  await expect(page.locator('.splide__arrow--next')).toBeDisabled();
  await expect(page.locator('.splide__pagination__page')).toHaveCount(2);
  expect(await coverage(page)).toEqual([]);
});

test('refresh supports an empty list and later repopulation without stale clones', async ({ page }) => {
  await mount(page, { type: 'loop', perPage: 3, perMove: 1 });
  await page.evaluate(() => { slider.Components.Elements.list.replaceChildren(); slider.refresh(); slider.go('>'); });
  expect(await page.evaluate(() => [slider.index, slider.length])).toEqual([0, 0]);
  await expect(page.locator('.splide__pagination__page')).toHaveCount(0);
  await page.evaluate(() => {
    slider.Components.Elements.list.innerHTML = Array.from({ length: 5 }, (_, i) => `<div class="splide__slide" data-card="${i}">${i}</div>`).join('');
    slider.refresh(); slider.go('>');
  });
  expect(await page.evaluate(() => [slider.index, slider.length])).toEqual([1, 5]);
  await expect(page.locator('.splide__pagination')).toHaveCount(1);
  expect(await coverage(page)).toEqual([]);
});

test('custom arrows survive repeated options updates and dispatch exactly one move', async ({ page }) => {
  await mount(page, { perPage: 2, perMove: 1 }, { custom: true });
  const result = await page.evaluate(() => {
    const next = slider.root.querySelector('.splide__arrow--next');
    let moves = 0; slider.on('move', () => moves++);
    for (let i = 0; i < 5; i++) {
      slider.options = { gap: i * 3, arrows: false, pagination: false };
      slider.options = { arrows: true, pagination: true };
    }
    next.click();
    return { same: next === slider.root.querySelector('.splide__arrow--next'), moves, index: slider.index, label: next.textContent, groups: slider.root.querySelectorAll('.splide__arrows').length };
  });
  expect(result).toEqual({ same: true, moves: 1, index: 1, label: 'Forward', groups: 1 });
});

for (const order of ['child first', 'parent first']) {
  test(`nested controls remain independent when mounted ${order}`, async ({ page }) => {
    await mount(page, {}, { nested: true });
    await page.evaluate(order => {
      slider.destroy();
      const child = () => { window.innerSlider = new Splide('#inner', { speed: 0 }).mount(); };
      if (order === 'child first') child();
      slider.mount();
      if (order === 'parent first') child();
      innerSlider.root.querySelector('.splide__arrow--next').click();
    }, order);
    expect(await page.evaluate(() => [slider.index, innerSlider.index])).toEqual([0, 1]);
    await page.evaluate(() => slider.root.querySelector(':scope > .splide__arrows .splide__arrow--next').click());
    expect(await page.evaluate(() => [slider.index, innerSlider.index])).toEqual([1, 1]);
    await page.evaluate(() => innerSlider.root.querySelectorAll('.splide__pagination__page')[2].click());
    expect(await page.evaluate(() => [slider.index, innerSlider.index])).toEqual([1, 2]);
    await expect(page.locator('#deck > .splide__pagination .splide__pagination__page')).toHaveCount(7);
    await expect(page.locator('#inner > .splide__pagination .splide__pagination__page')).toHaveCount(3);
  });
}

test('parent control toggles and destroy leave child controls connected and functional', async ({ page }) => {
  await mount(page, {}, { nested: true });
  const result = await page.evaluate(() => {
    window.innerSlider = new Splide('#inner', { speed: 0 }).mount();
    const next = innerSlider.root.querySelector('.splide__arrow--next');
    const bullets = [...innerSlider.root.querySelectorAll('.splide__pagination__page')];
    for (let i = 0; i < 3; i++) {
      slider.options = { arrows: false, pagination: false };
      slider.options = { arrows: true, pagination: true };
    }
    slider.destroy(); next.click();
    const connected = next.isConnected && bullets.every(el => el.isConnected);
    slider.mount(); next.click();
    return { connected, child: innerSlider.index, parent: slider.index, same: next === innerSlider.root.querySelector('.splide__arrow--next') };
  });
  expect(result).toEqual({ connected: true, child: 2, parent: 0, same: true });
});

test('breakpoint resize cycles rebuild loop clones and controls without accumulation', async ({ page }) => {
  await mount(page, { type: 'loop', perPage: 3, perMove: 1, gap: 16, breakpoints: { 800: { perPage: 2 }, 500: { perPage: 1 } } });
  for (const width of [450, 700, 900, 450, 900]) {
    await page.setViewportSize({ width, height: 700 });
    const perPage = width <= 500 ? 1 : width <= 800 ? 2 : 3;
    await expect.poll(() => page.evaluate(() => slider.options.perPage)).toBe(perPage);
    await expect(page.locator('.splide__slide--clone')).toHaveCount(perPage * 4);
    await expect(page.locator('.splide__pagination')).toHaveCount(1);
    await expect(page.locator('.splide__pagination__page')).toHaveCount(Math.ceil(7 / perPage));
    await page.evaluate(() => slider.go('>'));
    expect(await coverage(page)).toEqual([]);
  }
});

test('initial destroy breakpoint creates no controls or clones and survives repeated remount', async ({ page }) => {
  await mount(page, { type: 'loop', breakpoints: { 500: { destroy: true } } }, { width: 450 });
  for (let i = 0; i < 3; i++) {
    await expect(page.locator('.splide__slide--clone, .splide__arrows, .splide__pagination')).toHaveCount(0);
    await expect(page.locator('#deck')).toBeVisible();
    await page.setViewportSize({ width: 900, height: 700 });
    await expect.poll(() => page.evaluate(() => slider.state.is(Splide.STATES.IDLE))).toBe(true);
    await page.evaluate(() => slider.go('>'));
    await expect(page.locator('.splide__pagination')).toHaveCount(1);
    await page.setViewportSize({ width: 450, height: 700 });
    await expect.poll(() => page.evaluate(() => slider.state.is(Splide.STATES.DESTROYED))).toBe(true);
  }
});

test('min-width breakpoints resolve in order and restore base values on exit', async ({ page }) => {
  await mount(page, { perPage: 1, gap: 5, mediaQuery: 'min', breakpoints: { 600: { perPage: 2, gap: 10 }, 900: { perPage: 3, gap: 20 } } });
  for (const [width, perPage, gap] of [[1000, 3, 20], [700, 2, 10], [450, 1, 5], [1000, 3, 20]]) {
    await page.setViewportSize({ width, height: 700 });
    await expect.poll(() => page.evaluate(() => [slider.options.perPage, slider.options.gap])).toEqual([perPage, gap]);
    expect(await page.locator('.splide__slide').first().evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo((600 + gap) / perPage - gap, 0);
  }
});

test('new breakpoint options apply immediately without resizing the fixed track', async ({ page }) => {
  await mount(page, { perPage: 3 });
  await page.evaluate(() => { slider.options = { breakpoints: { 1000: { perPage: 2 } } }; });
  expect(await page.evaluate(() => slider.options.perPage)).toBe(2);
  expect(await page.locator('.splide__slide').first().evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(300, 0);
  await page.evaluate(() => { slider.options = { breakpoints: null }; });
  expect(await page.evaluate(() => slider.options.perPage)).toBe(3);
  await page.setViewportSize({ width: 700, height: 700 });
  await expect.poll(() => page.evaluate(() => slider.options.perPage)).toBe(3);
});

test('mobile autoplay visits all four slides and stays at the last one', async ({ page }) => {
  await freezeClock(page);
  await mount(page, { perPage: 2, autoplay: true, interval: 1000, pauseOnHover: false, pauseOnFocus: false, breakpoints: { 768: { perPage: 1 } } }, { count: 4, width: 390 });
  for (const index of [1, 2, 3, 3, 3]) {
    await page.clock.runFor(1000);
    expect(await page.evaluate(() => slider.index)).toBe(index);
  }
});

test('rewind autoplay completes repeated cycles without loop clones', async ({ page }) => {
  await freezeClock(page);
  await mount(page, { autoplay: true, rewind: true, interval: 100, pauseOnHover: false, pauseOnFocus: false }, { count: 4 });
  for (const index of [1, 2, 3, 0, 1, 2, 3, 0]) {
    await page.clock.runFor(100);
    expect(await page.evaluate(() => slider.index)).toBe(index);
  }
  await expect(page.locator('.splide__slide--clone')).toHaveCount(0);
});

test('changing autoplay interval replaces its timer and starts a full new interval', async ({ page }) => {
  await freezeClock(page);
  await mount(page, { autoplay: true, interval: 1000, pauseOnHover: false, pauseOnFocus: false });
  await page.clock.runFor(800);
  await page.evaluate(() => { slider.options = { interval: 400 }; });
  await page.clock.runFor(399);
  expect(await page.evaluate(() => slider.index)).toBe(0);
  await page.clock.runFor(1);
  expect(await page.evaluate(() => slider.index)).toBe(1);
  await page.clock.runFor(800);
  expect(await page.evaluate(() => slider.index)).toBe(3);
});

test('focus pauses autoplay until focus leaves the slider', async ({ page }) => {
  await freezeClock(page);
  await mount(page, { autoplay: true, interval: 1000, pauseOnHover: false });
  await page.locator('.splide__slide a').first().focus();
  await page.clock.runFor(2500);
  expect(await page.evaluate(() => slider.index)).toBe(0);
  await page.evaluate(() => document.activeElement.blur());
  await page.clock.runFor(999);
  expect(await page.evaluate(() => slider.index)).toBe(0);
  await page.clock.runFor(1);
  expect(await page.evaluate(() => slider.index)).toBe(1);
});

test('visibility changes suspend autoplay and resume with a fresh interval', async ({ page }) => {
  await freezeClock(page);
  await mount(page, { autoplay: true, interval: 1000, pauseOnHover: false, pauseOnFocus: false });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(2500);
  expect(await page.evaluate(() => slider.index)).toBe(0);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => slider.index)).toBe(1);
});

test('repeated autoplay toggles leave only one timer', async ({ page }) => {
  await freezeClock(page);
  await mount(page, { interval: 1000, pauseOnHover: false, pauseOnFocus: false });
  await page.evaluate(() => {
    window.moves = 0; slider.on('move', () => moves++);
    for (let i = 0; i < 5; i++) { slider.options = { autoplay: false }; slider.options = { autoplay: true }; }
  });
  await page.clock.runFor(3000);
  expect(await page.evaluate(() => [slider.index, moves])).toEqual([3, 3]);
});

test('destroy restores author slide styles, ARIA and descendant tab order', async ({ page }) => {
  await mount(page);
  const result = await page.evaluate(() => {
    slider.destroy();
    const slide = document.querySelector('[data-card="5"]'), link = slide.querySelector('a');
    slide.style.cssText = 'width:137px;color:red'; slide.setAttribute('aria-hidden', 'false'); link.tabIndex = 4;
    const before = [slide.getAttribute('style'), slide.getAttribute('aria-hidden'), link.getAttribute('tabindex')];
    slider.mount(); slider.go(2); slider.destroy();
    return { before, after: [slide.getAttribute('style'), slide.getAttribute('aria-hidden'), link.getAttribute('tabindex')] };
  });
  expect(result.after).toEqual(result.before);
});

test('destroy and remount do not multiply keyboard or arrow listeners', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) { slider.destroy(); slider.mount(); } });
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => slider.index)).toBe(1);
  await page.locator('.splide__arrow--next').click();
  expect(await page.evaluate(() => slider.index)).toBe(2);
});

test('revealing a hidden track recalculates geometry without a window resize', async ({ page }) => {
  await mount(page, { perPage: 3, perMove: 1, gap: 16 });
  await page.evaluate(() => { slider.destroy(); slider.root.style.display = 'none'; slider.mount(); slider.go(2); slider.root.style.display = ''; });
  await expect.poll(() => page.locator('[data-card="2"]').evaluate(el => el.getBoundingClientRect().left)).toBeCloseTo(0, 1);
  expect(await coverage(page)).toEqual([]);
});
