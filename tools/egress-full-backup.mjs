import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedProject = 'gacqqaimdfvkmznsglpg';
const concurrency = 8;
const envText = await readFile(resolve(root, '.env.local'), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const split = line.indexOf('=');
  return [line.slice(0, split), line.slice(split + 1)];
}));
const projectRef = new URL(env.SUPABASE_URL).hostname.split('.')[0];
if (projectRef !== expectedProject) throw new Error(`Proyecto incorrecto: se esperaba ${expectedProject}.`);
if (!env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) throw new Error('Falta SUPABASE_SECRET_KEY en .env.local.');

const base = env.SUPABASE_URL.replace(/\/$/, '');
const headers = { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', 'T').replace(/Z$/, 'Z');
const backupDir = resolve(root, 'backups', `originales-${timestamp}`);
const failures = [];
await mkdir(backupDir, { recursive: false });

async function request(path, init = {}) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        signal: AbortSignal.timeout(90_000),
        headers: { ...headers, ...init.headers }
      });
      if (response.ok) return response;
      const error = new Error(`HTTP ${response.status} en ${path}`);
      if (response.status < 500 && response.status !== 429) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (/HTTP 4\d\d/.test(String(error.message)) && !/429/.test(String(error.message))) throw error;
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 400 * 2 ** attempt));
  }
  throw lastError || new Error(`Falló la solicitud ${path}`);
}

async function listPrefix(bucket, prefix) {
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const response = await request(`/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
    });
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Inventario inválido del bucket ${bucket}/${prefix}`);
    rows.push(...page);
    if (page.length < 100) break;
  }
  return rows;
}

async function walkBucket(bucket, prefix = '', collected = []) {
  const rows = await listPrefix(bucket, prefix);
  for (const item of rows) {
    if (item.metadata && Number.isFinite(Number(item.metadata.size))) {
      collected.push({
        bucket,
        path: `${prefix}${item.name}`,
        size: Number(item.metadata.size),
        contentType: item.metadata.mimetype || 'application/octet-stream',
        etag: String(item.metadata.eTag || '').replace(/^"|"$/g, '').toLowerCase(),
        cacheControl: item.metadata.cacheControl || null,
        createdAt: item.created_at || null,
        updatedAt: item.updated_at || null,
        lastModified: item.metadata.lastModified || item.updated_at || null
      });
    } else {
      const directory = `${prefix}${item.name.replace(/\/$/, '')}/`;
      await walkBucket(bucket, directory, collected);
    }
  }
  return collected;
}

const bucketResponse = await request('/storage/v1/bucket');
const buckets = await bucketResponse.json();
if (!Array.isArray(buckets) || !buckets.length) throw new Error('Supabase devolvió una lista de buckets vacía.');
const objects = [];
for (const bucket of buckets) objects.push(...await walkBucket(bucket.id));
objects.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.path.localeCompare(b.path));
if (!objects.length) throw new Error('El inventario remoto no contiene objetos; se detiene el respaldo.');

const objectTotal = objects.reduce((sum, object) => sum + object.size, 0);
const etagIssues = objects.filter(object => !/^[a-f0-9]{32}$/.test(object.etag));
if (etagIssues.length) throw new Error(`No se pudo validar MD5 remoto para ${etagIssues.length} objetos. No se descargó ni modificó Storage.`);

const inventory = {
  projectRef,
  capturedAt: new Date().toISOString(),
  bucketCount: buckets.length,
  objectCount: objects.length,
  totalBytes: objectTotal,
  objects
};
await writeFile(resolve(backupDir, 'remote-inventory.json'), JSON.stringify(inventory, null, 2));

let next = 0;
let completed = 0;
const hashes = new Array(objects.length);
async function downloadWorker() {
  while (next < objects.length && failures.length === 0) {
    const index = next++;
    const object = objects[index];
    const target = resolve(backupDir, object.bucket, ...object.path.split('/'));
    const rel = relative(backupDir, target);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) {
      failures.push({ bucket: object.bucket, path: object.path, error: 'La ruta sale del respaldo.' });
      return;
    }
    try {
      await mkdir(dirname(target), { recursive: true });
      const url = `${base}/storage/v1/object/public/${encodeURIComponent(object.bucket)}/${object.path.split('/').map(encodeURIComponent).join('/')}`;
      let lastError;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
          if (!response.ok || !response.body) throw new Error(`Descarga HTTP ${response.status}`);
          const responseEtag = (response.headers.get('etag') || '').replace(/^"|"$/g, '').toLowerCase();
          if (responseEtag && responseEtag !== object.etag) throw new Error('ETag HTTP distinto al inventario.');
          const sha = createHash('sha256');
          const md5 = createHash('md5');
          let bytes = 0;
          const meter = new Transform({ transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            sha.update(chunk);
            md5.update(chunk);
            callback(null, chunk);
          } });
          await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(target, { flags: 'w' }));
          const sha256 = sha.digest('hex');
          const md5Hex = md5.digest('hex');
          if (bytes !== object.size) throw new Error(`Tamaño distinto: remoto=${object.size}, respaldo=${bytes}`);
          if (md5Hex !== object.etag) throw new Error(`Checksum MD5 distinto al ETag remoto (${object.etag}).`);
          hashes[index] = { sha256, md5: md5Hex, size: bytes };
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          await rm(target, { force: true }).catch(() => {});
          await new Promise(resolveDelay => setTimeout(resolveDelay, 500 * 2 ** attempt));
        }
      }
      if (lastError) throw lastError;
      completed += 1;
      if (completed % 50 === 0 || completed === objects.length) process.stdout.write(`Respaldados ${completed}/${objects.length}\n`);
    } catch (error) {
      failures.push({ bucket: object.bucket, path: object.path, error: String(error.message || error) });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, downloadWorker));
if (failures.length) {
  await writeFile(resolve(backupDir, 'ERROR-incompleto.json'), JSON.stringify({ capturedAt: new Date().toISOString(), completed, failures }, null, 2));
  throw new Error(`Respaldo incompleto: ${failures.length} fallo(s). No se hizo ningún cambio remoto. Se conservó el respaldo parcial en ${backupDir}`);
}

const manifestObjects = [];
for (const [index, object] of objects.entries()) {
  const target = resolve(backupDir, object.bucket, ...object.path.split('/'));
  const diskSha = createHash('sha256');
  const diskMd5 = createHash('md5');
  const { createReadStream } = await import('node:fs');
  let bytes = 0;
  for await (const chunk of createReadStream(target)) {
    bytes += chunk.length;
    diskSha.update(chunk);
    diskMd5.update(chunk);
  }
  const sha256 = diskSha.digest('hex');
  const md5 = diskMd5.digest('hex');
  if (bytes !== hashes[index].size || sha256 !== hashes[index].sha256 || md5 !== object.etag) {
    throw new Error(`La verificación local falló para ${object.bucket}/${object.path}; no se hizo ningún cambio remoto.`);
  }
  manifestObjects.push({ ...object, sha256, md5, backupRelativePath: `${object.bucket}/${object.path}` });
}

const manifest = { projectRef, capturedAt: inventory.capturedAt, objectCount: objects.length, totalBytes: objectTotal, checksumAlgorithm: 'SHA-256 local + MD5 remoto ETag', objects: manifestObjects };
await writeFile(resolve(backupDir, 'backup-manifest.json'), JSON.stringify(manifest, null, 2));
await writeFile(resolve(backupDir, 'backup-complete.json'), JSON.stringify({ projectRef, objectCount: objects.length, totalBytes: objectTotal, verified: true, sha256Count: manifestObjects.length, etagMd5Count: manifestObjects.length, capturedAt: inventory.capturedAt }, null, 2));
process.stdout.write(JSON.stringify({ projectRef, backupDir: relative(root, backupDir), bucketCount: buckets.length, objectCount: objects.length, totalBytes: objectTotal, sha256Verified: manifestObjects.length, remoteEtagMd5Verified: manifestObjects.length }, null, 2));
