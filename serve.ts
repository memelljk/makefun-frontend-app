// serve.ts — a small static file server for developing the app in
// app/ locally. Node 22+, standard library only.
//
//   node serve.ts              serves on http://localhost:8080
//   node serve.ts --port 9000  serves on that port instead
//
// It streams files out of app/, maps a directory path to its
// index.html, answers HEAD with headers only, and refuses any path
// that climbs out of app/. Development use only.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('./app', import.meta.url)));

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);

function wantedPort(argv) {
  const at = argv.indexOf('--port');
  const n = Number(at >= 0 ? argv[at + 1] : '');
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 8080;
}

// The file a request path names, or null when it escapes app/.
function targetFor(pathname) {
  const rel = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const file = resolve(join(rootDir, `.${rel}`));
  return file === rootDir || file.startsWith(rootDir + sep) ? file : null;
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end('only GET and HEAD\n');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
  } catch {
    res.writeHead(400);
    res.end('bad request\n');
    return;
  }
  const file = targetFor(pathname);
  if (file === null) {
    res.writeHead(403);
    res.end('outside the app directory\n');
    return;
  }
  let info;
  try {
    info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
  } catch {
    res.writeHead(404);
    res.end('no such file\n');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  handle(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end('server error\n');
  });
});

server.listen(wantedPort(process.argv), '127.0.0.1', () => {
  console.log(`make.fun live, developed locally: http://localhost:${server.address().port}`);
});
