import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

await mkdir('.docs-site', { recursive: true });
for (const name of ['index.html', 'docs.css', 'docs.js']) await copyFile(`docs/${name}`, `.docs-site/${name}`);
for (const name of ['nano-swipe.js', 'nano-swipe.mjs', 'nano-swipe.css']) await copyFile(`dist/${name}`, `.docs-site/${name}`);
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const gzip = async name => gzipSync(await readFile(`dist/${name}`), { level: 9 }).length;
await writeFile('.docs-site/docs-meta.json', JSON.stringify({ version, jsGzip: await gzip('nano-swipe.js'), cssGzip: await gzip('nano-swipe.css') }));
console.log('Documentation built in .docs-site/');
