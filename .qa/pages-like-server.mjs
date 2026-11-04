// Static server that mimics GitHub Pages delivery for measurements: gzip for text
// assets, Cache-Control: max-age=600, ETag + Last-Modified revalidation.
// Usage: node .qa/pages-like-server.mjs [port=8081]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.argv[2] || 8081);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const compressible = /^(text\/|application\/(javascript|json)|image\/svg)/;
createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const target = resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  const file = pathname.endsWith('/') ? resolve(target, 'index.html') : target;
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error();
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const type = mime[extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'content-type': type, 'cache-control': 'max-age=600', etag, 'last-modified': info.mtime.toUTCString(), vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return; }
    let body = await readFile(file);
    if (compressible.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { body = gzipSync(body, { level: 6 }); headers['content-encoding'] = 'gzip'; }
    headers['content-length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); }
}).listen(port, '127.0.0.1', () => process.stdout.write(`Pages-like server on http://localhost:${port} (${root})\n`));
