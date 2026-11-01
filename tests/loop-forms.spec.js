import { test, expect } from '@playwright/test';

async function mount(page, options = {}) {
  await page.setContent(`<!doctype html><style>body{margin:0}.splide{width:400px}.splide__slide{height:180px}</style>
    <div id="outside">Outside description</div><form id="order"><div id="deck" class="splide"><div class="splide__track"><div class="splide__list">${Array.from({ length: 4 }, (_, i) => `<div class="splide__slide" data-card="${i}">
      <span id="title-${i}">Title ${i}</span><span id="help-${i}">Help ${i}</span>
      <input type="checkbox" id="check-${i}" name="check-${i}"><label for="check-${i}">Check ${i}</label>
      <input type="radio" id="radio-${i}" name="plan" value="${i}"><label for="radio-${i}">Plan ${i}</label>
      <input id="text-${i}" name="text-${i}" value="initial-${i}" aria-labelledby="title-${i}" aria-describedby="help-${i} outside" list="suggest-${i}">
      <datalist id="suggest-${i}"><option value="suggestion"></datalist>
      <textarea id="note-${i}" name="note-${i}">note-${i}</textarea>
      <input type="file" id="file-${i}" name="file-${i}">
      <select id="select-${i}" name="select-${i}"><option>A</option><option>B</option></select>
      <select id="multi-${i}" multiple><option>A</option><option>B</option><option>C</option></select>
      <a href="#title-${i}">Local</a><a href="/other#title-${i}">External</a>
      <svg><defs><linearGradient id="paint-${i}"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="5" height="5" fill="url(#paint-${i})"/></svg>
    </div>`).join('')}</div></div></div></form>`);
  await page.addStyleTag({ path: 'dist/nano-swipe.css' });
  await page.addScriptTag({ path: 'dist/nano-swipe.js' });
  await page.evaluate(options => { window.slider = new Splide('#deck', { type: 'loop', speed: 0, ...options }).mount(); }, options);
}

test('loop descendants have unique IDs while all original IDs remain intact', async ({ page }) => {
  await mount(page);
  const result = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
    return { unique: new Set(ids).size === ids.length, original: slider.Components.Elements.slides.map(el => el.querySelector('input[type="checkbox"]').id) };
  });
  expect(result).toEqual({ unique: true, original: ['check-0', 'check-1', 'check-2', 'check-3'] });
});

test('clone labels, ARIA, datalist, local fragments and SVG resources stay local', async ({ page }) => {
  await mount(page);
  const valid = await page.locator('.splide__slide--clone').evaluateAll(clones => clones.every(slide => {
    const text = slide.querySelector('input[list]');
    return [...slide.querySelectorAll('label')].every(label => label.control && slide.contains(label.control))
      && slide.contains(document.getElementById(text.getAttribute('aria-labelledby')))
      && text.getAttribute('aria-describedby').split(' ').every(id => id === 'outside' || slide.contains(document.getElementById(id)))
      && slide.contains(document.getElementById(text.getAttribute('list')))
      && slide.contains(document.getElementById(slide.querySelector('a').hash.slice(1)))
      && slide.querySelectorAll('a')[1].getAttribute('href').startsWith('/other#title-')
      && slide.querySelector('rect').getAttribute('fill') === `url(#${slide.querySelector('linearGradient').id})`;
  }));
  expect(valid).toBe(true);
});

test('clicking the visible original label toggles its checkbox and all its clones', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => slider.go(2));
  await page.locator('label[for="check-2"]').click();
  await expect(page.locator('#check-2')).toBeChecked();
  expect(await page.locator('[data-card="2"] input[type="checkbox"]').evaluateAll(inputs => inputs.every(el => el.checked))).toBe(true);
});

test('clicking a clone label updates the original without duplicate change events', async ({ page }) => {
  await mount(page);
  const result = await page.evaluate(() => {
    let changes = 0; slider.root.addEventListener('change', () => changes++);
    const clone = slider.root.querySelector('.splide__slide--clone[data-card="2"]');
    clone.querySelector('label').click(); slider.go(2);
    return { changes, checked: slider.Components.Elements.slides[2].querySelector('input').checked };
  });
  expect(result).toEqual({ changes: 1, checked: true });
});

for (const [selector, value, eventType] of [['input[list]', 'edited', 'input'], ['textarea', 'edited note', 'input'], ['select:not([multiple])', 'B', 'change']]) {
  test(`editing clone ${selector} survives navigation and refresh`, async ({ page }) => {
    await mount(page);
    await page.evaluate(({ selector, value, eventType }) => {
      const input = slider.root.querySelector('.splide__slide--clone[data-card="2"]').querySelector(selector);
      input.value = value; input.dispatchEvent(new Event(eventType, { bubbles: true }));
      slider.go(2); slider.refresh();
    }, { selector, value, eventType });
    await expect(page.locator('.splide__slide:not(.splide__slide--clone)[data-card="2"]').locator(selector)).toHaveValue(value);
    expect(await page.locator('[data-card="2"]').evaluateAll((slides, { selector, value }) => slides.every(slide => slide.querySelector(selector).value === value), { selector, value })).toBe(true);
  });
}

test('multiple select preserves the full selection across clones', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    const select = slider.root.querySelector('.splide__slide--clone[data-card="2"] select[multiple]');
    select.options[0].selected = true; select.options[2].selected = true;
    select.dispatchEvent(new Event('change', { bubbles: true })); slider.go(2);
  });
  expect(await page.locator('[data-card="2"] select[multiple]').evaluateAll(selects => selects.map(select => [...select.selectedOptions].map(option => option.value)))).toEqual([['A', 'C'], ['A', 'C']]);
});

test('radio groups in clones do not uncheck the selected original', async ({ page }) => {
  await mount(page);
  const result = await page.evaluate(() => {
    const originals = slider.Components.Elements.slides;
    originals[2].querySelector('[type="radio"]').click();
    const before = originals.map(slide => slide.querySelector('[type="radio"]').checked);
    slider.root.querySelector('.splide__slide--clone[data-card="3"] [type="radio"]').click();
    return { before, after: originals.map(slide => slide.querySelector('[type="radio"]').checked), clonesAgree: [...slider.root.querySelectorAll('[data-card="3"] [type="radio"]')].every(input => input.checked) };
  });
  expect(result).toEqual({ before: [false, false, true, false], after: [false, false, false, true], clonesAgree: true });
});

test('cloned inputs do not add duplicate fields to the surrounding form', async ({ page }) => {
  await mount(page);
  const fields = await page.evaluate(() => [...new FormData(document.querySelector('#order')).keys()]);
  expect(fields.filter(name => name.startsWith('text-'))).toHaveLength(4);
  expect(fields.filter(name => name.startsWith('note-'))).toHaveLength(4);
  expect(fields.filter(name => name.startsWith('select-'))).toHaveLength(4);
});

test('programmatic original state is copied before the next navigation', async ({ page }) => {
  await mount(page);
  expect(await page.evaluate(() => {
    const input = slider.Components.Elements.slides[2].querySelector('input');
    input.checked = true; input.indeterminate = true;
    slider.go(2);
    return [...slider.root.querySelectorAll('[data-card="2"] input[type="checkbox"]')].every(el => el.checked && el.indeterminate);
  })).toBe(true);
});

test('destroy restores the original form IDs and keeps edited values', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    const input = slider.root.querySelector('.splide__slide--clone[data-card="2"] input[list]');
    input.value = 'preserved'; input.dispatchEvent(new Event('input', { bubbles: true })); slider.destroy();
  });
  await expect(page.locator('#text-2')).toHaveValue('preserved');
  await expect(page.locator('label[for="check-2"]')).toHaveCount(1);
  await expect(page.locator('#text-2')).toHaveAttribute('aria-describedby', 'help-2 outside');
  expect(await page.locator('#text-2').evaluate(input => input.form.id)).toBe('order');
});

test('file selection from a clone is retained in the original and other copies', async ({ page }) => {
  await mount(page);
  await page.locator('.splide__slide--clone[data-card="2"] input[type="file"]').setInputFiles({ name: 'sample.txt', mimeType: 'text/plain', buffer: Buffer.from('sample') });
  await page.evaluate(() => slider.go(2));
  expect(await page.locator('[data-card="2"] input[type="file"]').evaluateAll(inputs => inputs.map(input => input.files[0]?.name))).toEqual(['sample.txt', 'sample.txt']);
});

test('resetting the surrounding form resets both originals and clones', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    const input = slider.root.querySelector('.splide__slide--clone[data-card="2"] input[list]');
    input.value = 'changed'; input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#order').reset();
  });
  await expect.poll(() => page.locator('[data-card="2"] input[list]').evaluateAll(inputs => inputs.map(input => input.value))).toEqual(['initial-2', 'initial-2']);
});

test('synchronizing an edited clone preserves its caret position', async ({ page }) => {
  await mount(page);
  const caret = await page.evaluate(() => {
    const input = slider.root.querySelector('.splide__slide--clone[data-card="2"] input[list]');
    input.value = 'hello world'; input.setSelectionRange(5, 5);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return [input.selectionStart, input.selectionEnd];
  });
  expect(caret).toEqual([5, 5]);
});

test('a form inside a cloned slide keeps its radio field names and resets shared values', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    slider.destroy(); document.querySelector('#order').replaceWith(slider.root);
    slider.Components.Elements.slides[2].innerHTML = '<form id="inner-order"><input type="radio" name="plan" value="A" checked><input type="radio" name="plan" value="B"></form>';
    slider.mount();
  });
  const result = await page.evaluate(async () => {
    const clone = slider.root.querySelector('.splide__slide--clone[data-card="2"] form');
    clone.querySelector('[value="B"]').click();
    const submitted = new FormData(clone).get('plan');
    const original = new FormData(document.querySelector('#inner-order')).get('plan');
    clone.reset(); await Promise.resolve();
    return { submitted, original, reset: new FormData(document.querySelector('#inner-order')).get('plan') };
  });
  expect(result).toEqual({ submitted: 'B', original: 'B', reset: 'A' });
});
