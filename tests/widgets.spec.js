import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const root = process.env.WIDGET_ROOT || 'D:/widget_types';
for (const id of [1, 7, 8, 10, 14, 17]) {
  test(`unchanged promo_slider_${id} JS, pagination and editor updates`, async ({ browser }) => {
    test.skip(!existsSync(join(root, `system_widget_v4_promo_slider_${id}`, 'snippet.js')), 'External widget fixtures require WIDGET_ROOT. Full widget certification is checked separately.');
    const snapshots = [];
    for (const original of [true, false]) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setContent(`<!doctype html><style>body{margin:0}.splide{width:600px}.splide__slide{height:100px}</style>
        <div class="editable-widget layout" data-widget-id="42"><section id="widget" class="promo-slider">
        <div class="splide js-promo-slider" data-autoplay="false" data-autoplay-delay="1">
        <div class="splide__track"><div class="splide__list">${'<div class="splide__slide">slide</div>'.repeat(5)}</div></div>
        <div class="splide__arrows"><button class="splide__arrow splide__arrow--prev"></button><button class="splide__arrow splide__arrow--next"></button></div>
        <div class="promo-slider__pagination"></div><div class="promo-slider__controls"></div>
        <button class="js-move-slide promo-slider__arrow-prev"></button><button class="js-move-slide promo-slider__arrow-next"></button>
        </div></section></div>`);
      await page.addStyleTag({ path: original ? 'node_modules/@splidejs/splide/dist/css/splide-core.min.css' : 'dist/nano-swipe.css' });
      await page.addScriptTag({ path: 'node_modules/jquery/dist/jquery.min.js' });
      await page.addScriptTag({ path: original ? 'node_modules/@splidejs/splide/dist/js/splide.min.js' : 'dist/nano-swipe.js' });
      await page.evaluate(() => {
        Splide.defaults = { speed: 0 };
        window.$widget = $('#widget');
        window.subscribers = [];
        window.EventBus = { subscribe: (names, callback) => subscribers.push(callback) };
      });
      await page.addScriptTag({ path: join(root, `system_widget_v4_promo_slider_${id}`, 'snippet.js') });
      await expect.poll(() => page.evaluate(() => !!document.querySelector('.splide').splide)).toBe(true);
      await page.waitForTimeout(50);
      const capture = () => page.evaluate(() => {
        const s = document.querySelector('.splide').splide;
        return { index: s.index, length: s.length, root: [...s.root.classList].sort(),
          pagination: [...document.querySelectorAll('.splide__pagination__page, .promo-slider__pagination-item')].map(b => [b.textContent, [...b.classList].sort(), b.getAttribute('aria-current')]) };
      });
      const steps = [await capture()];
      await page.evaluate(() => document.querySelector('.splide').splide.go(3));
      await page.waitForTimeout(30); steps.push(await capture());
      await page.evaluate(() => subscribers.forEach(callback => callback({ widget_id: 42, setting_name: 'autoplay-delay', value: 2 })));
      await page.waitForTimeout(50); steps.push(await capture());
      expect(errors).toEqual([]);
      snapshots.push(steps);
      await page.close();
    }
    expect(snapshots[1]).toEqual(snapshots[0]);
  });
}
