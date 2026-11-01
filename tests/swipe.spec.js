import { test, expect } from '@playwright/test';
import { freezeClock } from './helpers/clock.js';

// Gesture scenarios adapted from tvist 5458032:
// DragModule.test.ts, DragLoopPositionBug.test.ts and integration/drag-gaps.test.ts.
async function mount(page, options = {}, original = false) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:0;min-height:2400px}.splide{width:360px}.splide__slide{height:120px}</style>
    <div class="splide"><div class="splide__track"><div class="splide__list">${Array.from({ length: 10 }, (_, i) => `<div class="splide__slide"><a href="#${i}">Card ${i}</a></div>`).join('')}</div></div></div>`);
  await page.addStyleTag({ path: original ? 'node_modules/@splidejs/splide/dist/css/splide-core.min.css' : 'dist/nano-swipe.css' });
  await page.addScriptTag({ path: original ? 'node_modules/@splidejs/splide/dist/js/splide.min.js' : 'dist/nano-swipe.js' });
  await page.evaluate(options => {
    window.slider = new Splide('.splide', { speed: 0, perPage: 3, perMove: 1, gap: 16, ...options }).mount();
    window.gestureTime = 1000;
    // Synthetic touches cannot acquire native pointer capture. Real input is tested separately.
    slider.Components.Elements.track.setPointerCapture = () => {};
  }, options);
}

async function gesture(page, points, source = 'touch') {
  return page.evaluate(({ points, source }) => {
    const track = slider.Components.Elements.track;
    let prevented = [];
    for (let i = 0; i < points.length; i++) {
      const [x, y, elapsed = 20, explicitPhase] = points[i];
      gestureTime += elapsed;
      const phase = explicitPhase || (i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'move');
      let event;
      if (source === 'touch') {
        const touch = { identifier: 7, target: track, clientX: x, clientY: y, pageX: x, pageY: y };
        // Desktop Firefox/WebKit lack constructible Touch/TouchEvent. Supply
        // deterministic event data; native browser touch input is tested via CDP.
        window.TouchEvent ||= class TouchEvent extends Event {};
        event = new Event(`touch${phase}`, { bubbles: true, cancelable: true });
        Object.setPrototypeOf(event, TouchEvent.prototype);
        for (const [key, value] of Object.entries({ touches: /end|cancel/.test(phase) ? [] : [touch], targetTouches: /end|cancel/.test(phase) ? [] : [touch], changedTouches: [touch] })) Object.defineProperty(event, key, { value });
      } else if (source === 'legacy') {
        event = new MouseEvent(`mouse${phase === 'start' ? 'down' : phase === 'end' ? 'up' : 'move'}`, { clientX: x, clientY: y, bubbles: true, cancelable: true });
      } else {
        event = new PointerEvent(`pointer${phase === 'start' ? 'down' : phase === 'end' ? 'up' : 'move'}`, { pointerId: 7, pointerType: source, isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true });
      }
      Object.defineProperty(event, 'timeStamp', { value: gestureTime });
      track.dispatchEvent(event);
      prevented.push(event.defaultPrevented);
    }
    return { index: slider.index, prevented };
  }, { points, source });
}

for (const source of ['touch', 'mouse']) {
  test(`${source}: quick flick uses Splide velocity and flickMaxPages`, async ({ page }) => {
    const results = [];
    for (const original of [true, false]) {
      await mount(page, {}, original);
      const result = await gesture(page, [[250, 60], [238, 60, 20], [220, 60, 20], [220, 60, 10]], original && source === 'mouse' ? 'legacy' : source);
      expect(result.index).toBeGreaterThan(0);
      results.push(result.index);
    }
    expect(results[1]).toBe(results[0]);
  });

  test(`${source}: repeated small slow drags stay on the same loop slide`, async ({ page }) => {
    await mount(page, { type: 'loop' });
    for (const delta of [30, 30, -30, -30]) {
      const result = await gesture(page, [[180, 60], [180 + delta / 2, 60, 250], [180 + delta, 60, 250], [180 + delta, 60, 250]], source);
      expect(result.index).toBe(0);
    }
  });

  test(`${source}: long held drag snaps to physical release without stale momentum`, async ({ page }) => {
    await mount(page);
    const result = await gesture(page, [[330, 60], [300, 60, 100], [200, 60, 250], [70, 60, 250], [70, 60, 250]], source);
    expect(result.index).toBe(2);
  });

  test(`${source}: diagonal swipe works and vertical scrolling is not prevented`, async ({ page }) => {
    await mount(page);
    expect((await gesture(page, [[250, 30], [230, 40], [190, 60], [190, 60]], source)).index).toBeGreaterThan(0);
    await page.evaluate(() => slider.go(0));
    const vertical = await gesture(page, [[180, 20], [182, 45], [184, 90], [184, 90]], source);
    expect(vertical.index).toBe(0);
    expect(vertical.prevented).not.toContain(true);
  });

  test(`${source}: moving out and back then holding does not advance`, async ({ page }) => {
    await mount(page, { type: 'loop' });
    const result = await gesture(page, [[250, 60], [190, 60], [130, 60], [250, 60], [250, 60, 250]], source);
    expect(result.index).toBe(0);
  });
}

for (const source of ['touch', 'mouse']) {
  test(`${source}: a swipe interrupts a loop transition without jumping`, async ({ page }) => {
    await mount(page, { type: 'loop', speed: 400, easing: 'linear' });
    await page.evaluate(() => {
      slider.go('<');
      // Freeze the animation at a known visual offset, with its completion pending.
      const list = slider.Components.Elements.list;
      list.style.transition = 'none';
      const transform = new DOMMatrix(getComputedStyle(list).transform).m41;
      list.style.transform = `translateX(${transform + 40}px)`;
    });
    const visibleCards = () => page.locator('.splide__slide').evaluateAll(slides => slides.map(slide => ({ card: slide.textContent, x: slide.getBoundingClientRect().x })).filter(slide => slide.x > 0 && slide.x < 300));
    const before = await visibleCards();
    expect(before.length).toBeGreaterThan(0);
    await gesture(page, [[250, 60], [230, 60, 20, 'move']], source);
    const after = await page.locator('.splide__slide').evaluateAll(slides => slides.map(slide => ({ card: slide.textContent, x: slide.getBoundingClientRect().x })));
    for (const card of before) expect(after.some(slide => slide.card === card.card && Math.abs(slide.x - card.x + 20) < 1)).toBe(true);
    await gesture(page, [[80, 60, 20, 'move'], [80, 60, 250, 'end']], source);
    await expect.poll(() => page.evaluate(() => slider.state.is(Splide.STATES.IDLE))).toBe(true);
    expect(await page.evaluate(() => slider.index)).not.toBe(9);
  });
}

test('touch cancellation restores position and a later gesture still works', async ({ page }) => {
  await mount(page, { type: 'loop' });
  const result = await gesture(page, [[250, 60], [190, 60], [190, 60, 20, 'cancel']]);
  expect(result.index).toBe(0);
  expect((await gesture(page, [[250, 60], [220, 60], [190, 60], [190, 60]])).index).toBeGreaterThan(0);
});

test('delayed compatibility click after touch drag is suppressed until a new tap', async ({ page }) => {
  await mount(page);
  await gesture(page, [[250, 60], [220, 60], [190, 60], [190, 60]]);
  await page.waitForTimeout(30);
  const allowed = await page.locator('.splide__slide.is-active a').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  expect(allowed).toBe(false);
  expect(await page.evaluate(() => location.hash)).toBe('');
  await gesture(page, [[180, 60], [180, 60]]);
  await page.locator('.splide__slide.is-active a').evaluate(el => el.click());
  expect(await page.evaluate(() => location.hash)).not.toBe('');
});

test('flick tuning follows Splide for low power and capped multi-page momentum', async ({ page }) => {
  for (const options of [{ flickPower: 100 }, { flickMaxPages: 0.25 }, { flickPower: 1200, flickMaxPages: 2 }]) {
    const indices = [];
    for (const original of [true, false]) {
      await mount(page, options, original);
      indices.push((await gesture(page, [[250, 60], [238, 60], [220, 60], [220, 60, 10]])).index);
    }
    expect(indices[1]).toBe(indices[0]);
  }
});

test('Safari-style pointer cancellation does not discard an ongoing native touch stream', async ({ page }) => {
  await mount(page);
  await gesture(page, [[250, 60], [230, 60, 20, 'move']]);
  await page.evaluate(() => slider.Components.Elements.track.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, pointerType: 'touch', bubbles: true })));
  expect((await gesture(page, [[190, 60, 20, 'move'], [190, 60, 20, 'end']])).index).toBeGreaterThan(0);
});

test('a second finger releases the slider for pinch zoom and leaves no stale drag', async ({ page }) => {
  await mount(page);
  await gesture(page, [[250, 60], [230, 60, 20, 'move']]);
  await page.evaluate(() => {
    const event = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: [{ identifier: 7 }, { identifier: 8 }] });
    slider.Components.Elements.track.dispatchEvent(event);
  });
  const cancelled = await gesture(page, [[190, 60, 20, 'move'], [190, 60, 20, 'end']]);
  expect(cancelled.index).toBe(0);
  expect(cancelled.prevented).not.toContain(true);
  expect((await gesture(page, [[250, 60], [220, 60], [190, 60], [190, 60]])).index).toBeGreaterThan(0);
});

test('tapping an excluded button after a swipe is not blocked by click suppression', async ({ page }) => {
  await mount(page);
  await gesture(page, [[250, 60], [220, 60], [190, 60], [190, 60]]);
  const clicks = await page.evaluate(() => {
    const button = document.createElement('button');
    slider.Components.Elements.slides[slider.index].append(button);
    let clicks = 0;
    button.addEventListener('click', () => clicks++);
    const event = new Event('touchstart', { bubbles: true });
    Object.defineProperty(event, 'touches', { value: [{ identifier: 7 }] });
    button.dispatchEvent(event);
    button.click();
    return clicks;
  });
  expect(clicks).toBe(1);
});

// Further adaptations from tvist DragModule, AutoplayModule, CenterLoopBug,
// DragLoopPositionBug, DragFreeSnap and integration/auto-width test scenarios.
for (const source of ['touch', 'mouse']) {
  test(`${source}: custom threshold delays drag events and default prevention`, async ({ page }) => {
    await mount(page, { dragMinThreshold: { mouse: 15, touch: 25 } });
    await page.evaluate(() => { window.drags = 0; slider.on('drag', () => drags++); });
    const below = await gesture(page, [[250, 60], [240, 60, 20, 'move']], source);
    expect(below.prevented).not.toContain(true);
    expect(await page.evaluate(() => drags)).toBe(0);
    const above = await gesture(page, [[220, 60, 20, 'move'], [220, 60, 250, 'end']], source);
    expect(above.prevented[0]).toBe(true);
    expect(await page.evaluate(() => drags)).toBe(1);
  });

  test(`${source}: changing drag at runtime disables and re-enables gestures`, async ({ page }) => {
    await mount(page, { drag: false });
    const points = [[250, 60], [220, 60], [190, 60], [190, 60]];
    const disabled = await gesture(page, points, source);
    expect(disabled.index).toBe(0);
    expect(disabled.prevented).not.toContain(true);
    await page.evaluate(() => { slider.options = { drag: true }; });
    expect((await gesture(page, points, source)).index).toBeGreaterThan(0);
    await page.evaluate(() => { slider.go(0); slider.options = { drag: false }; });
    expect((await gesture(page, points, source)).index).toBe(0);
  });

  test(`${source}: a tap without movement does not stop a pending transition`, async ({ page }) => {
    await freezeClock(page);
    await mount(page, { speed: 400 });
    await page.evaluate(() => { window.moved = 0; slider.on('moved', () => moved++); slider.go(2); });
    await gesture(page, [[180, 60], [180, 60]], source);
    expect(await page.evaluate(() => [slider.state.is(Splide.STATES.MOVING), moved])).toEqual([true, 0]);
    await page.clock.runFor(400);
    expect(await page.evaluate(() => [slider.index, slider.state.is(Splide.STATES.IDLE), moved])).toEqual([2, true, 1]);
  });

  test(`${source}: centered loop drag follows reversals without changing the index before release`, async ({ page }) => {
    await mount(page, { type: 'loop', focus: 'center' });
    const position = () => page.locator('.splide__list').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
    const initial = await position();
    await gesture(page, [[250, 60], [220, 60, 20, 'move']], source);
    expect(await position()).toBeCloseTo(initial - 30, 0);
    await gesture(page, [[190, 60, 20, 'move']], source);
    expect(await position()).toBeCloseTo(initial - 60, 0);
    await gesture(page, [[235, 60, 20, 'move']], source);
    expect(await position()).toBeCloseTo(initial - 15, 0);
    expect(await page.evaluate(() => slider.index)).toBe(0);
    await gesture(page, [[235, 60, 250, 'end']], source);
    expect(await position()).toBeCloseTo(initial, 0);
  });

  for (const edge of ['first', 'last']) {
    test(`${source}: dragging outward at the ${edge} slide resists and snaps back`, async ({ page }) => {
      await mount(page);
      const index = edge === 'first' ? 0 : 7, delta = edge === 'first' ? 100 : -100;
      await page.evaluate(index => slider.go(index), index);
      const position = () => page.locator('.splide__list').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
      const before = await position();
      await gesture(page, [[180, 60], [180 + delta, 60, 20, 'move']], source);
      expect(await position()).toBeCloseTo(before + delta / 5, 0);
      await gesture(page, [[180 + delta, 60, 250, 'end']], source);
      expect(await page.evaluate(() => slider.index)).toBe(index);
      expect(await position()).toBeCloseTo(before, 0);
    });
  }

  test(`${source}: variable-width drag snaps using card geometry`, async ({ page }) => {
    await mount(page, { autoWidth: true, focus: 0 });
    await page.addStyleTag({ content: '.splide__slide:nth-child(4n+1){width:80px}.splide__slide:nth-child(4n+2){width:180px}.splide__slide:nth-child(4n+3){width:100px}.splide__slide:nth-child(4n){width:240px}' });
    await page.evaluate(() => slider.refresh());
    expect(await page.locator('.splide__slide').nth(1).evaluate(el => el.getBoundingClientRect().width)).toBe(180);
    await gesture(page, [[330, 60], [300, 60], [200, 60, 250], [80, 60, 250], [80, 60, 250]], source);
    expect(await page.evaluate(() => slider.index)).toBe(2);
    expect(await page.locator('.splide__slide').nth(2).evaluate(el => el.getBoundingClientRect().left)).toBeCloseTo(0, 0);
  });

  test(`${source}: destroy during drag ignores late input and remount accepts one new gesture`, async ({ page }) => {
    await mount(page);
    await gesture(page, [[250, 60], [220, 60, 20, 'move']], source);
    await page.evaluate(() => { slider.destroy(); window.lateMoves = 0; slider.on('move', () => lateMoves++); });
    await gesture(page, [[100, 60, 20, 'move'], [100, 60, 20, 'end']], source);
    expect(await page.evaluate(() => [slider.index, lateMoves])).toEqual([0, 0]);
    await page.evaluate(() => { slider.mount(); window.drags = 0; slider.on('drag', () => drags++); });
    expect((await gesture(page, [[250, 60], [220, 60], [190, 60], [190, 60]], source)).index).toBeGreaterThan(0);
    expect(await page.evaluate(() => drags)).toBe(1);
  });

  test(`${source}: drag events occur once and navigation starts only after release`, async ({ page }) => {
    await mount(page);
    await page.evaluate(() => {
      window.dragLog = [];
      for (const event of ['drag', 'dragging', 'dragged', 'move', 'moved']) slider.on(event, () => dragLog.push(event));
    });
    await gesture(page, [[250, 60], [220, 60, 20, 'move'], [190, 60, 20, 'move']], source);
    expect(await page.evaluate(() => [slider.index, dragLog])).toEqual([0, ['drag', 'dragging', 'dragging']]);
    await gesture(page, [[190, 60, 20, 'end']], source);
    expect(await page.evaluate(() => dragLog)).toEqual(['drag', 'dragging', 'dragging', 'dragged', 'move', 'moved']);
  });

  test(`${source}: autoplay pauses during drag and resumes after a full interval`, async ({ page }) => {
    await freezeClock(page);
    await mount(page, { type: 'loop', autoplay: true, interval: 1000, pauseOnHover: false, pauseOnFocus: false });
    await page.clock.runFor(800);
    await gesture(page, [[250, 60], [220, 60, 20, 'move']], source);
    await page.clock.runFor(3000);
    expect(await page.evaluate(() => slider.index)).toBe(0);
    await gesture(page, [[220, 60, 250, 'end']], source);
    await page.clock.runFor(999);
    expect(await page.evaluate(() => slider.index)).toBe(0);
    await page.clock.runFor(1);
    expect(await page.evaluate(() => slider.index)).toBe(1);
  });
}

test('releasing a foreign touch identifier does not finish the active drag', async ({ page }) => {
  await mount(page);
  await gesture(page, [[250, 60], [230, 60, 20, 'move']]);
  await page.evaluate(() => {
    const event = new Event('touchend', { bubbles: true });
    Object.defineProperty(event, 'changedTouches', { value: [{ identifier: 8, clientX: 50, clientY: 60 }] });
    slider.Components.Elements.track.dispatchEvent(event);
  });
  expect((await gesture(page, [[190, 60, 20, 'move'], [190, 60, 20, 'end']])).index).toBeGreaterThan(0);
});

test('mixed compatibility input delivers only one touch drag lifecycle', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    window.dragStarts = 0; window.dragEnds = 0;
    slider.on('drag', () => dragStarts++); slider.on('dragged', () => dragEnds++);
    slider.Components.Elements.track.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 250, clientY: 60, bubbles: true }));
  });
  await gesture(page, [[250, 60], [220, 60, 20, 'move']]);
  await page.evaluate(() => {
    const track = slider.Components.Elements.track;
    track.dispatchEvent(new MouseEvent('mousedown', { clientX: 250, clientY: 60, bubbles: true }));
    track.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: 100, clientY: 60, bubbles: true }));
  });
  await gesture(page, [[190, 60, 20, 'move'], [190, 60, 20, 'end']]);
  expect(await page.evaluate(() => [dragStarts, dragEnds])).toEqual([1, 1]);
});

for (const phase of ['pending', 'active']) {
  test(`#1350 — disabling drag cancels a ${phase} touch gesture`, async ({ page }) => {
    await mount(page);
    await gesture(page, [[250, 60], [phase === 'active' ? 220 : 247, 60, 20, 'move']]);
    await page.evaluate(() => { slider.options = { drag: false }; });
    const result = await gesture(page, [[100, 60, 20, 'move'], [100, 60, 20, 'end']]);
    expect(result.index).toBe(0);
    expect(result.prevented).not.toContain(true);
    await page.evaluate(() => { slider.options = { drag: true }; });
    expect((await gesture(page, [[250, 60], [220, 60], [190, 60], [190, 60]])).index).toBeGreaterThan(0);
  });
}
