import { test, expect } from '@playwright/test';

// Adapted scenarios from VladimirIvanin/tvist at 5458032a407965d59dd64ef12f393ad75e31ea14.
// e2e/audit-regressions.spec.ts (004, 021, 027), tests/integration/audit-regressions.test.ts (002, 028),
// and tests/integration/{loop-destroy-clones,loop-rapid-navigation,nested-slider-drag,
// disabled-cleanup,review-regressions,hidden-slide-display-none}.test.ts.
async function mount(page, original, options = {}, count = 7) {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.setContent(`<!doctype html><style>
    body{margin:0}.splide{width:600px}.splide__slide{height:100px}
    [data-card="0"]{width:80px}[data-card="1"]{width:220px}[data-card="2"]{width:140px}
    [data-card="3"]{width:330px}[data-card="4"]{width:90px}
    </style><div id="deck" class="splide"><div class="splide__track"><div class="splide__list">${Array.from({ length: count }, (_, i) => `<div class="splide__slide" data-card="${i}"><a href="#card-${i}">${i}</a></div>`).join('')}</div></div></div>`);
  await page.addStyleTag({ path: original ? 'node_modules/@splidejs/splide/dist/css/splide-core.min.css' : 'dist/nano-swipe.css' });
  await page.addScriptTag({ path: original ? 'node_modules/@splidejs/splide/dist/js/splide.min.js' : 'dist/nano-swipe.js' });
  await page.evaluate(options => { window.slider = new Splide('#deck', { speed: 0, ...options }).mount(); }, options);
}

async function state(page) {
  return page.evaluate(() => ({
    index: slider.index, length: slider.length,
    slides: [...slider.Components.Elements.list.children].map(el => ({
      card: el.dataset.card, classes: [...el.classList].sort(),
      width: Math.round(el.getBoundingClientRect().width * 10) / 10,
      left: Math.round(el.getBoundingClientRect().left * 10) / 10,
    })),
    buttons: [...slider.root.querySelectorAll('.splide__arrow')].map(el => el.disabled),
    pages: [...slider.root.querySelectorAll('.splide__pagination__page')].map(el => el.getAttribute('aria-current')),
  }));
}

async function compare(browser, options, scenario, count) {
  const results = [];
  for (const original of [true, false]) {
    const page = await browser.newPage();
    try {
      await mount(page, original, options, count);
      results.push(await scenario(page));
    } finally { await page.close(); }
  }
  function check(actual, expected, path = 'state') {
    if (typeof expected === 'number') {
      expect(Math.abs(actual - expected), path).toBeLessThan(0.25);
    } else if (Array.isArray(expected)) {
      expect(actual).toHaveLength(expected.length);
      expected.forEach((value, i) => check(actual[i], value, `${path}[${i}]`));
    } else if (expected && typeof expected === 'object') {
      expect(Object.keys(actual)).toEqual(Object.keys(expected));
      for (const key in expected) check(actual[key], expected[key], `${path}.${key}`);
    } else expect(actual).toEqual(expected);
  }
  check(results[1], results[0]);
}

test('tvist 004 — readonly autoWidth update is rejected without keeping stale generated widths', async ({ page }) => {
  await mount(page, false, { perPage: 3 }, 5);
  const before = await state(page);
  await expect(page.evaluate(() => { slider.options = { autoWidth: true }; })).rejects.toThrow('autoWidth');
  expect(await state(page)).toEqual(before);
});

test('tvist 021 — calc gap matches physical navigation stride', async ({ browser }) => {
  await compare(browser, { perPage: 2, perMove: 1, gap: 'calc(1rem + 2px)' }, async page => {
    await page.evaluate(() => slider.go(3));
    return state(page);
  });
});

test('tvist 002 — refresh discovers inserted and removed slides and updates controls', async ({ browser }) => {
  await compare(browser, { perPage: 3, perMove: 1 }, async page => {
    await page.evaluate(() => {
      slider.go(4);
      const list = slider.Components.Elements.list;
      list.firstElementChild.remove();
      list.insertAdjacentHTML('beforeend', '<div class="splide__slide" data-card="7">new</div>');
      slider.refresh();
    });
    return state(page);
  });
});

test('tvist hidden slide — refresh restores author inline styles as Splide does', async ({ browser }) => {
  await compare(browser, { perPage: 2, perMove: 1 }, async page => {
    await page.evaluate(() => {
      slider.Components.Elements.slides[1].style.display = 'none';
      slider.refresh(); slider.go(3);
    });
    return state(page);
  });
});

test('tvist 027 — variable widths, refresh and loop seams retain coverage', async ({ browser }) => {
  await compare(browser, { type: 'loop', autoWidth: true, gap: 12, padding: { left: 24, right: 8 } }, async page => {
    const states = [];
    for (let i = 0; i < 11; i++) {
      await page.evaluate(i => { if (i < 3) slider.refresh(); else slider.go('>'); }, i);
      states.push(await state(page));
    }
    return states;
  }, 5);
});

test('tvist loop destroy — repeated remount keeps originals and clone count', async ({ browser }) => {
  await compare(browser, { type: 'loop', perPage: 2, perMove: 1 }, async page => {
    const states = [];
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const originals = slider.Components.Elements.slides.slice();
        slider.destroy();
        if (document.querySelectorAll('.splide__slide').length !== originals.length) throw new Error('Leaked clones');
        slider.mount();
        if (!originals.every((el, i) => slider.Components.Elements.slides[i] === el)) throw new Error('Lost original identity');
        slider.go(2);
      });
      states.push(await state(page));
    }
    return states;
  }, 4);
});

test('tvist loop rapid navigation — clicks finish transitions and retain viewport coverage', async ({ browser }) => {
  await compare(browser, { type: 'loop', perPage: 2, perMove: 1, gap: 16, speed: 80 }, async page => {
    await page.evaluate(() => { window.acceptedMoves = []; slider.on('move', (next, old) => acceptedMoves.push([next, old])); });
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => slider.root.querySelector('.splide__arrow--prev').click());
      await page.waitForTimeout(15);
      const holes = await page.evaluate(() => {
        const track = slider.Components.Elements.track.getBoundingClientRect();
        const rectangles = [...slider.Components.Elements.list.children].map(el => el.getBoundingClientRect()).sort((a, b) => a.left - b.left);
        let edge = track.left;
        const holes = [];
        for (const rect of rectangles) {
          if (rect.right < edge || rect.left > track.right) continue;
          if (rect.left - edge > 17) holes.push(rect.left - edge);
          edge = Math.max(edge, rect.right);
        }
        if (track.right - edge > 17) holes.push(track.right - edge);
        return holes;
      });
      expect(holes).toEqual([]);
    }
    await page.waitForTimeout(120);
    const moves = await page.evaluate(() => acceptedMoves);
    expect(moves.length).toBeGreaterThan(0);
    for (const [next, old] of moves) expect(next).toBe((old + 3) % 4);
    // Exact accepted click count is scheduler-dependent. Check stable geometry at a fixed final index.
    await page.evaluate(() => slider.go(2));
    await page.waitForTimeout(120);
    return state(page);
  }, 4);
});

test('tvist nested drag — inner gesture leaves outer slider unchanged', async ({ page }) => {
  await mount(page, false);
  await page.evaluate(() => {
    slider.Components.Elements.slides[0].innerHTML = '<div class="splide" id="inner" style="width:300px"><div class="splide__track"><div class="splide__list"><div class="splide__slide">inner 0</div><div class="splide__slide">inner 1</div></div></div></div>';
    window.innerSlider = new Splide('#inner', { speed: 0, arrows: false, pagination: false }).mount();
  });
  await page.mouse.move(230, 60); await page.mouse.down();
  await page.mouse.move(100, 60, { steps: 8 }); await page.mouse.up();
  expect(await page.evaluate(() => [slider.index, innerSlider.index])).toEqual([0, 1]);
});

test('tvist 028 — foreign pointer cannot replace an ongoing gesture', async ({ page }) => {
  await mount(page, false);
  await page.mouse.move(300, 60); await page.mouse.down();
  await page.evaluate(() => {
    const track = slider.Components.Elements.track;
    track.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 987, clientX: 150, bubbles: true, isPrimary: false }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 987 }));
  });
  await page.mouse.move(100, 60, { steps: 5 }); await page.mouse.up();
  expect(await page.evaluate(() => slider.index)).toBe(1);
});

test('tvist pointercancel — cancel restores position and ignores subsequent moves', async ({ page }) => {
  await mount(page, false);
  await page.evaluate(() => slider.root.addEventListener('pointerdown', event => { window.pointerId = event.pointerId; }, { once: true }));
  await page.mouse.move(250, 60); await page.mouse.down();
  await page.mouse.move(100, 60, { steps: 5 });
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId })));
  await page.mouse.move(50, 60); await page.mouse.up();
  expect(await page.evaluate(() => [slider.index, slider.Components.Elements.slides[0].getBoundingClientRect().left])).toEqual([0, 0]);
});

test('tvist disabled cleanup — destroy during autoplay and transition has no late events', async ({ page }) => {
  await mount(page, false, { type: 'loop', speed: 100, autoplay: true, interval: 80, pauseOnHover: false });
  await page.evaluate(() => {
    window.lateEvents = 0;
    slider.on('moved', () => lateEvents++);
    slider.go('>'); slider.destroy();
  });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => [lateEvents, document.querySelectorAll('.splide__slide--clone').length, document.querySelectorAll('.splide__pagination').length])).toEqual([0, 0, 0]);
});

test('tvist responsive autoplay — breakpoint-only timer stops on exit', async ({ page }) => {
  await mount(page, false, { interval: 80, pauseOnHover: false, breakpoints: { 600: { autoplay: true } } });
  await page.setViewportSize({ width: 500, height: 700 });
  await expect.poll(() => page.evaluate(() => slider.index)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 900, height: 700 });
  await expect.poll(() => page.evaluate(() => slider.options.autoplay)).toBe(undefined);
  const index = await page.evaluate(() => slider.index);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => slider.index)).toBe(index);
});
