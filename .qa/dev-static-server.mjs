import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.json': 'application/json' };
createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const target = resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  const file = pathname.endsWith('/') ? resolve(target, 'index.html') : target;
  try { const info = await stat(file); if (!info.isFile()) throw new Error(); res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' }); if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res); }
  catch { res.writeHead(404).end('Not found'); }
}).listen(8080, '127.0.0.1', () => process.stdout.write(`Local static server: ${root}\n`));
