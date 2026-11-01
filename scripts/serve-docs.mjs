import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

let port = Number(process.env.DOCS_PORT || 4173);
const initialPort = port;
const types = { 'index.html': 'text/html', 'docs.css': 'text/css', 'docs.js': 'text/javascript', 'nano-swipe.css': 'text/css', 'nano-swipe.js': 'text/javascript', 'nano-swipe.mjs': 'text/javascript', 'docs-meta.json': 'application/json' };
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const name = path === '/' ? 'index.html' : path.slice(1);
  if (!Object.hasOwn(types, name)) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const bytes = await readFile(new URL(`../.docs-site/${name}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': `${types[name]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch { response.writeHead(500); response.end('Run npm run docs:build first'); }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && !process.env.DOCS_PORT && port < initialPort + 10) {
    server.listen(++port, '127.0.0.1');
  } else { console.error(error.message); process.exitCode = 1; }
});
server.on('listening', () => console.log(`Local: http://127.0.0.1:${port}`));
server.listen(port, '127.0.0.1');
