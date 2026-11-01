import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

await mkdir('dist', { recursive: true });
// Underscored members are private; keep the documented public API intact.
const compact = { bundle: true, minify: true, target: 'es2020', mangleProps: /^_[a-zA-Z]/ };
await build({ ...compact, entryPoints: ['src/index.js'], format: 'esm', outfile: 'dist/nano-swipe.mjs' });
await build({ ...compact, entryPoints: ['src/browser.js'], format: 'iife', outfile: 'dist/nano-swipe.js' });
await build({ ...compact, entryPoints: ['src/index.js'], format: 'cjs', outfile: 'dist/nano-swipe.cjs' });
const css = await transform(await readFile('src/style.css', 'utf8'), { loader: 'css', minify: true });
await writeFile('dist/nano-swipe.css', css.code);
const sizes = {};
for (const file of ['nano-swipe.js', 'nano-swipe.mjs', 'nano-swipe.css']) {
  const bytes = await readFile(`dist/${file}`);
  sizes[file] = { bytes: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
}
console.table(sizes);
if (sizes['nano-swipe.js'].gzip > 7168 || sizes['nano-swipe.js'].gzip + sizes['nano-swipe.css'].gzip > 7680) throw new Error('Bundle size budget exceeded');
await mkdir('browser-build', { recursive: true });
await copyFile('dist/nano-swipe.js', 'browser-build/nano-swipe.min.js');
await copyFile('dist/nano-swipe.css', 'browser-build/nano-swipe.css');
await writeFile('browser-build/nano-swipe.min.js.gz', gzipSync(await readFile('dist/nano-swipe.js'), { level: 9 }));
