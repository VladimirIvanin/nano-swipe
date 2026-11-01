import { test, expect } from '@playwright/test';

async function setup(page, original = false, options = {}, width = 800) {
  await page.setViewportSize({ width, height: 800 });
  await page.setContent(`<!doctype html><style>body{margin:0}.splide{width:100%}.splide__slide{height:100px}button{height:24px}</style><div id="fixture" class="splide"><div class="splide__track"><ul class="splide__list">${Array.from({ length: 7 }, (_, i) => `<li class="splide__slide" style="width:${120 + i * 10}px"><a href="#${i}">${i}</a></li>`).join('')}</ul></div></div>`);
  await page.addStyleTag({ path: original ? 'node_modules/@splidejs/splide/dist/css/splide-core.min.css' : 'dist/nano-swipe.css' });
  await page.addScriptTag({ path: original ? 'node_modules/@splidejs/splide/dist/js/splide.min.js' : 'dist/nano-swipe.js' });
  await page.evaluate(options => {
    window.log = [];
    window.slider = new Splide('#fixture', { speed: 0, ...options });
    for (const name of ['mounted', 'updated', 'move', 'moved', 'active', 'arrows:updated', 'pagination:mounted']) {
      slider.on(name, (...args) => log.push([name, ...args.map(arg => typeof arg === 'number' ? arg : arg?.index ?? null)]));
    }
    slider.mount();
  }, options);
  await page.waitForTimeout(60);
}

async function snapshot(page) {
  return page.evaluate(() => ({
    index: slider.index, length: slider.length,
    slides: [...document.querySelectorAll('.splide__slide')].map(slide => ({
      classes: [...slide.classList].sort(), hidden: slide.getAttribute('aria-hidden'), tab: slide.getAttribute('tabindex'),
      x: Math.round(slide.getBoundingClientRect().left * 10) / 10,
      width: Math.round(slide.getBoundingClientRect().width * 10) / 10,
    })),
    arrows: [...document.querySelectorAll('.splide__arrow')].map(b => [b.disabled, b.getAttribute('aria-label')]),
    pages: [...document.querySelectorAll('.splide__pagination__page')].map(b => [b.classList.contains('is-active'), b.getAttribute('aria-current')]),
  }));
}

for (const width of [390, 1000]) {
  for (const [name, options] of Object.entries({
    single: { rewind: true }, row: { perPage: 3, perMove: 1, gap: 16 },
    padding: { perPage: 3, gap: '1rem', padding: { left: 12, right: 40 } },
    loop: { type: 'loop', perPage: 3, gap: 10, perMove: 1 },
    center: { autoWidth: true, focus: 'center', gap: 10 },
    focus: { perPage: 3, focus: 0, gap: 12 },
  })) {
    test(`${name} ${width} matches Splide DOM and geometry`, async ({ page }) => {
      const results = [];
      for (const original of [true, false]) {
        await setup(page, original, options, width);
        const steps = [await snapshot(page)];
        for (const command of ['>', '+2', '<', 6, '>', '-2', 0, '<']) {
          await page.evaluate(command => slider.go(command), command);
          await page.waitForTimeout(35);
          steps.push(await snapshot(page));
        }
        results.push(steps);
      }
      expect(results[1]).toEqual(results[0]);
    });
  }
}

test('event order and arguments match Splide', async ({ page }) => {
  const results = [];
  for (const original of [true, false]) {
    await setup(page, original, { perPage: 3, perMove: 1 });
    await page.evaluate(() => slider.go('+'));
    await page.waitForTimeout(40);
    results.push(await page.evaluate(() => log));
  }
  expect(results[1]).toEqual(results[0]);
});

test('updated event ordering and options in mounted match Splide', async ({ page }) => {
  const results = [];
  for (const original of [true, false]) {
    await setup(page, original, { pagination: false });
    await page.evaluate(() => { log.length = 0; slider.options = { perPage: 3, drag: false }; });
    results.push(await page.evaluate(() => log));
  }
  expect(results[1]).toEqual(results[0]);
});

test('autoplay pauses on hover and resumes', async ({ page }) => {
  await setup(page, false, { autoplay: true, interval: 100, rewind: true });
  await page.mouse.move(799, 799);
  await expect.poll(() => page.evaluate(() => slider.index)).not.toBe(0);
  await page.mouse.move(200, 60);
  const paused = await page.evaluate(() => slider.index);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => slider.index)).toBe(paused);
  await page.mouse.move(799, 799);
  await expect.poll(() => page.evaluate(() => slider.index)).not.toBe(paused);
});

test('resize applies breakpoint options and mounted supports options updates', async ({ page }) => {
  await setup(page, false, { perPage: 3, breakpoints: { 600: { perPage: 1, gap: 10 } } });
  await page.setViewportSize({ width: 390, height: 800 });
  await expect.poll(() => page.evaluate(() => slider.options.perPage)).toBe(1);
  expect(await page.locator('.splide__slide').first().evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(390, 0);
  await page.evaluate(() => {
    slider.destroy();
    slider = new Splide('#fixture');
    slider.on('mounted', () => { slider.options = { drag: false, perPage: 2 }; });
    slider.mount();
  });
  expect(await page.evaluate(() => [slider.options.drag, slider.options.perPage])).toEqual([false, 2]);
});

test('dynamic options, list replacement, refresh and destroy', async ({ page }) => {
  for (const original of [true, false]) {
    await setup(page, original);
    expect(await page.evaluate(() => { const options = slider.options; slider.options = { gap: 16 }; return slider.options === options && options.gap === 16; })).toBe(true);
    await page.evaluate(() => { slider.options = { perPage: 3, gap: 16 }; slider.go(4); });
    await page.waitForTimeout(35);
    expect(await page.evaluate(() => slider.index)).toBe(4);
    await page.evaluate(() => {
      slider.Components.Elements.list.innerHTML = '<li class="splide__slide">replacement</li>';
      slider.refresh();
    });
    expect(await page.evaluate(() => [slider.length, slider.index])).toEqual([1, 0]);
    await page.evaluate(() => slider.destroy());
    expect(await page.locator('.splide__slide--clone').count()).toBe(0);
    expect(await page.locator('.splide__pagination').count()).toBe(0);
  }
});

test('breakpoint destroy and automatic remount', async ({ page }) => {
  await setup(page, false, { breakpoints: { 600: { destroy: true } } });
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('.splide')).not.toHaveClass(/is-initialized/);
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(page.locator('.splide')).toHaveClass(/is-initialized/);
});

test('pointer drag, cancellation and link clicks', async ({ page }) => {
  await setup(page);
  await page.mouse.move(250, 60); await page.mouse.down();
  await page.mouse.move(80, 60, { steps: 10 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => slider.index)).toBe(1);
  expect(await page.evaluate(() => location.hash)).toBe('');
  await page.locator('.splide__slide').nth(1).locator('a').click();
  expect(await page.evaluate(() => location.hash)).toBe('#1');
});

test('swiping text prevents selection while disabled drag preserves text selection', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const slide = slider.Components.Elements.slides[0];
    slide.style.cssText += 'display:flex;justify-content:center;align-items:center';
    slide.innerHTML = '<span style="font-size:48px">Swipe this text</span>';
  });
  const text = page.locator('.splide__slide span').first();
  const box = await text.boundingBox();
  const start = box.x + box.width * 0.8;
  const end = box.x + box.width * 0.2;
  const y = box.y + box.height / 2;
  await page.mouse.move(start, y); await page.mouse.down();
  // Native selection can start during the small movements before the drag threshold.
  await page.mouse.move(start - 2, y);
  await page.mouse.move(start - 4, y);
  await page.mouse.move(end, y, { steps: 12 });
  expect(await page.evaluate(() => getSelection().toString())).toBe('');
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection().toString())).toBe('');
  await expect.poll(() => page.evaluate(() => slider.index)).toBe(1);
  await page.evaluate(() => { slider.go(0); slider.options = { drag: false }; });
  await page.mouse.move(start, y); await page.mouse.down();
  await page.mouse.move(end, y, { steps: 12 }); await page.mouse.up();
  expect(await page.evaluate(() => getSelection().toString())).not.toBe('');
  expect(await page.evaluate(() => slider.index)).toBe(0);
});

for (const kind of ['input', 'contenteditable']) {
  test(`dragging over ${kind} preserves editing and does not swipe`, async ({ page }) => {
    await setup(page);
    await page.evaluate(kind => {
      const style = 'width:350px;height:50px;font-size:28px';
      slider.Components.Elements.slides[0].innerHTML = kind === 'input'
        ? `<input style="${style}" value="Editable text words">`
        : `<div contenteditable="true" style="${style}"><span>Editable text words</span></div>`;
    }, kind);
    const field = page.locator(kind === 'input' ? '.splide input' : '.splide [contenteditable]');
    const box = await field.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 210, y); await page.mouse.down();
    await page.mouse.move(box.x + 30, y, { steps: 15 }); await page.mouse.up();
    expect(await field.evaluate(el => el instanceof HTMLInputElement
      ? el.selectionEnd > el.selectionStart : getSelection().toString().length > 0)).toBe(true);
    expect(await page.evaluate(() => slider.index)).toBe(0);
  });
}

test('noDrag matches Splide on the surface, descendants and runtime options', async ({ page }) => {
  const results = [];
  for (const original of [true, false]) {
    await setup(page, original, { noDrag: '.zoomix-touch, .zoomix-touch *' });
    await page.evaluate(() => {
      slider.Components.Elements.slides[0].innerHTML = '<div class="zoomix-touch" style="width:800px;height:100px"><span style="display:block;width:500px;height:100%">Zoom text for selection</span></div>';
      window.drags = 0; window.zoomMoves = 0; window.prevented = false;
      slider.on('drag', () => drags++);
      window.addEventListener('pointermove', event => {
        if (event.target.closest('.zoomix-touch')) { zoomMoves++; prevented ||= event.defaultPrevented; }
      });
    });
    const span = page.locator('.zoomix-touch span');
    const box = await span.boundingBox();
    const swipe = async (start = 480, end = 30) => {
      await page.mouse.move(box.x + start, box.y + 50); await page.mouse.down();
      await page.mouse.move(box.x + end, box.y + 50, { steps: 12 });
      // Release at rest so Splide's flick inertia does not change the target slide.
      await page.waitForTimeout(250); await page.mouse.up();
    };
    await swipe(740, 560);
    expect(await page.evaluate(() => [slider.index, drags])).toEqual([0, 0]);
    await swipe();
    expect(await page.evaluate(() => [slider.index, drags, zoomMoves > 0, prevented])).toEqual([0, 0, true, false]);
    await span.click();
    expect(await span.evaluate(el => {
      const event = new Event('selectstart', { bubbles: true, cancelable: true });
      return el.dispatchEvent(event);
    })).toBe(true);
    await page.evaluate(() => { slider.options = { noDrag: '.zoomix-touch' }; });
    // Splide matches the event target itself. A parent-only selector leaves descendants draggable.
    await swipe();
    await expect.poll(() => page.evaluate(() => slider.index)).toBe(1);
    await page.evaluate(() => { slider.go(0); slider.options = { noDrag: '' }; });
    await swipe(740, 200);
    await expect.poll(() => page.evaluate(() => slider.index)).toBe(1);
    results.push(await page.evaluate(() => [slider.index, drags]));
  }
  expect(results[1]).toEqual(results[0]);
});

test('noDrag applies to matching loop clones and leaves normal slides draggable', async ({ page }) => {
  await setup(page, false, { type: 'loop', noDrag: '.zoomix-touch, .zoomix-touch *' });
  await page.evaluate(() => {
    const slide = slider.Components.Elements.slides.at(-1);
    slide.innerHTML = '<div class="zoomix-touch" style="width:100%;height:100%"><span>Zoom</span></div>';
    slider.refresh();
    slider.options = { padding: { left: 160, right: 0 } };
    window.drags = 0; window.downs = 0;
    slider.on('drag', () => drags++);
    slider.root.addEventListener('pointerdown', event => {
      if (event.target.closest('.splide__slide--clone .zoomix-touch')) downs++;
    });
  });
  const track = await page.locator('.splide__track').boundingBox();
  await page.mouse.move(track.x + 120, track.y + 60); await page.mouse.down();
  await page.mouse.move(track.x + 30, track.y + 60, { steps: 10 }); await page.mouse.up();
  expect(await page.evaluate(() => [slider.index, drags, downs])).toEqual([0, 0, 1]);
  await page.mouse.move(track.x + 500, track.y + 60); await page.mouse.down();
  await page.mouse.move(track.x + 300, track.y + 60, { steps: 10 }); await page.mouse.up();
  expect(await page.evaluate(() => [slider.index, drags])).toEqual([1, 1]);
});
