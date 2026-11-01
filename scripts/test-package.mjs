import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const cache = resolve('.cache');
await mkdir(cache, { recursive: true });
const consumer = await mkdtemp(join(cache, 'package-'));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this check with npm run test:package');
const run = (args, cwd) => execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  const packed = JSON.parse(run(['pack', '--ignore-scripts', '--json', '--pack-destination', consumer], process.cwd()))[0];
  const archive = join(consumer, packed.filename);
  const files = packed.files.map(file => file.path);
  for (const file of ['dist/nano-swipe.mjs', 'dist/nano-swipe.cjs', 'dist/nano-swipe.css', 'browser-build/nano-swipe.min.js', 'browser-build/nano-swipe.min.js.gz', 'browser-build/nano-swipe.css', 'README.md', 'LICENSE']) assert(files.includes(file), `Missing ${file}`);
  assert(!files.some(file => /^(?:tests|reports|docs|scripts|node_modules)\//.test(file)), 'Unexpected package contents');
  await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}');
  run(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', archive], consumer);
  execFileSync(process.execPath, ['--input-type=module', '-e', "import Slider, { Splide } from 'nano-swipe'; import { createRequire } from 'node:module'; const cjs=createRequire(import.meta.url)('nano-swipe'); if(typeof Slider !== 'function' || Splide !== Slider || typeof cjs.default !== 'function') throw Error('Invalid exports'); createRequire(import.meta.url).resolve('nano-swipe/css');"], { cwd: consumer, stdio: 'pipe' });
  const installed = join(consumer, 'node_modules/nano-swipe');
  for (const file of ['nano-swipe.min.js', 'nano-swipe.css', 'nano-swipe.min.js.gz']) {
    assert.deepEqual(await readFile(join(installed, 'browser-build', file)), await readFile(join('browser-build', file)));
  }
  assert.deepEqual(gunzipSync(await readFile(join(installed, 'browser-build/nano-swipe.min.js.gz'))), await readFile(join(installed, 'browser-build/nano-swipe.min.js')));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><div class="splide" style="width:500px"><div class="splide__track"><div class="splide__list"><div class="splide__slide">1</div><div class="splide__slide">2</div></div></div></div>');
    await page.addStyleTag({ path: join(installed, 'browser-build/nano-swipe.css') });
    await page.addScriptTag({ path: join(installed, 'browser-build/nano-swipe.min.js') });
    assert.deepEqual(await page.evaluate(() => { const s = new Splide('.splide', { speed: 0 }).mount(); s.go(1); return [s.length, s.index]; }), [2, 1]);
  } finally { await browser.close(); }
  console.log(`Verified npm archive ${packed.filename}: ESM, CommonJS, browser, CSS and gzip.`);
} finally {
  if (dirname(consumer) !== cache) throw new Error('Unexpected package test directory');
  await rm(consumer, { recursive: true, force: true });
}
