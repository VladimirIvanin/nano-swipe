import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/index.js'], bundle: true, minify: true, format: 'esm', outfile: 'dist/nano-swipe.mjs', target: 'es2020' });
await build({ entryPoints: ['src/browser.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/nano-swipe.js', target: 'es2020' });
await build({ entryPoints: ['src/index.js'], bundle: true, minify: true, format: 'cjs', outfile: 'dist/nano-swipe.cjs', target: 'es2020' });
const css = await transform(await readFile('src/style.css', 'utf8'), { loader: 'css', minify: true });
await writeFile('dist/nano-swipe.css', css.code);
const sizes = {};
for (const file of ['nano-swipe.js', 'nano-swipe.mjs', 'nano-swipe.css']) {
  const bytes = await readFile(`dist/${file}`);
  sizes[file] = { bytes: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
}
console.table(sizes);
if (sizes['nano-swipe.js'].gzip > 5632 || sizes['nano-swipe.js'].gzip + sizes['nano-swipe.css'].gzip > 6142) throw new Error('Bundle size budget exceeded');
await mkdir('browser-build', { recursive: true });
await copyFile('dist/nano-swipe.js', 'browser-build/nano-swipe.min.js');
await copyFile('dist/nano-swipe.css', 'browser-build/nano-swipe.css');
await writeFile('browser-build/nano-swipe.min.js.gz', gzipSync(await readFile('dist/nano-swipe.js'), { level: 9 }));
