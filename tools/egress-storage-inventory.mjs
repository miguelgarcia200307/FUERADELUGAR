import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedProject = 'gacqqaimdfvkmznsglpg';
const envText = await readFile(resolve(root, '.env.local'), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const split = line.indexOf('=');
  return [line.slice(0, split), line.slice(split + 1)];
}));
if (new URL(env.SUPABASE_URL).hostname.split('.')[0] !== expectedProject) throw new Error('El URL configurado no corresponde al proyecto esperado.');
if (!env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) throw new Error('Falta SUPABASE_SECRET_KEY local.');

const base = env.SUPABASE_URL.replace(/\/$/, '');
const headers = { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
const backups = (await readdir(resolve(root, 'backups'), { withFileTypes: true }))
  .filter(item => item.isDirectory()).map(item => item.name).sort().reverse();
let selectedDir = null;
for (const name of backups) {
  const candidate = resolve(root, 'backups', name);
  try { await readFile(resolve(candidate, 'database-public.json')); selectedDir = candidate; break; }
  catch { /* Keep looking for the latest complete database export. */ }
}
if (!selectedDir) throw new Error('No hay un respaldo de base de datos completo para asociar al inventario.');
const database = JSON.parse(await readFile(resolve(selectedDir, 'database-public.json'), 'utf8'));

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    signal: AbortSignal.timeout(45_000),
    headers: { ...headers, ...init.headers }
  });
  if (!response.ok) throw new Error(`Supabase respondió ${response.status} en ${path}.`);
  return response;
}

async function listPrefix(bucketId, prefix) {
  const items = [];
  let pages = 0;
  for (let offset = 0; ; offset += 100) {
    const response = await request(`/storage/v1/object/list/${encodeURIComponent(bucketId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
    });
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Respuesta inesperada al inventariar bucket ${bucketId}.`);
    items.push(...page);
    pages += 1;
    if (page.length < 100) break;
  }
  return { items, pages };
}

const apiResponse = await request('/rest/v1/');
const buckets = await (await request('/storage/v1/bucket')).json();
const objects = [];
for (const [bucketIndex, bucket] of buckets.entries()) {
  process.stdout.write(`Bucket ${bucketIndex + 1}/${buckets.length}: ${bucket.id}\n`);
  const pending = [''];
  const seenPrefixes = new Set();
  let pageCount = 0;
  let prefixCount = 0;
  while (pending.length) {
    const batch = pending.splice(0, 12).filter(prefix => {
      if (seenPrefixes.has(prefix)) return false;
      seenPrefixes.add(prefix);
      return true;
    });
    if (!batch.length) continue;
    const result = await Promise.all(batch.map(prefix => listPrefix(bucket.id, prefix)));
    prefixCount += batch.length;
    for (const [resultIndex, { items, pages }] of result.entries()) {
      const prefix = batch[resultIndex];
      pageCount += pages;
      for (const item of items) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id == null && !item.metadata) pending.push(path);
        else objects.push({
          bucket: bucket.id,
          path,
          size: Number(item.metadata?.size ?? item.size ?? 0),
          contentType: item.metadata?.mimetype ?? item.metadata?.contentType ?? null,
          createdAt: item.created_at ?? null,
          updatedAt: item.updated_at ?? null,
          lastAccessedAt: item.last_accessed_at ?? null
        });
      }
    }
    if (prefixCount % 120 === 0 || !pending.length) process.stdout.write(`  ${prefixCount} prefijos; ${objects.filter(object => object.bucket === bucket.id).length} objetos\n`);
  }
  process.stdout.write(`  ${pageCount} páginas en ${prefixCount} prefijos; ${objects.filter(object => object.bucket === bucket.id).length} objetos\n`);
}

const inventory = {
  projectRef: expectedProject,
  exportedAt: new Date().toISOString(),
  buckets: buckets.map(({ id, name, public: isPublic, file_size_limit, allowed_mime_types }) => ({ id, name, public: isPublic, fileSizeLimit: file_size_limit, allowedMimeTypes: allowed_mime_types })),
  objects,
  totalBytes: objects.reduce((sum, object) => sum + object.size, 0)
};
await writeFile(resolve(selectedDir, 'storage-inventory.json'), JSON.stringify(inventory, null, 2));

const references = [];
const dataImagePattern = /data:image\/[a-z0-9.+-]+;base64,/i;
const storageUrlPattern = /https?:\/\/[^\s"']+\.supabase\.co\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^\s"']+/i;
for (const [table, rows] of Object.entries(database.tables)) {
  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      if (typeof value !== 'string') continue;
      if (/image|media|photo|logo|banner|video|asset|url/i.test(column) || storageUrlPattern.test(value) || dataImagePattern.test(value)) {
        references.push({ table, rowId: row.id ?? null, column, value, kind: dataImagePattern.test(value) ? 'base64' : storageUrlPattern.test(value) ? 'storage-url' : 'candidate' });
      }
    }
  }
}
await writeFile(resolve(selectedDir, 'media-references.json'), JSON.stringify(references, null, 2));

const byBucket = inventory.buckets.map(bucket => {
  const files = objects.filter(object => object.bucket === bucket.id);
  return { bucket: bucket.id, objectCount: files.length, bytes: files.reduce((sum, object) => sum + object.size, 0) };
});
const imageObjects = objects.filter(object => /^image\//i.test(object.contentType || '') || /\.(?:jpe?g|png|webp|gif|avif|svg)$/i.test(object.path));
const imageBytes = imageObjects.reduce((sum, object) => sum + object.size, 0);
const report = {
  projectRef: expectedProject,
  apiStatus: apiResponse.status,
  tables: Object.fromEntries(Object.entries(database.tables).map(([name, rows]) => [name, rows.length])),
  bucketSummary: byBucket,
  storageBytes: inventory.totalBytes,
  imageObjectCount: imageObjects.length,
  imageBytes,
  averageImageBytes: imageObjects.length ? Math.round(imageBytes / imageObjects.length) : 0,
  top20: [...objects].sort((a, b) => b.size - a.size).slice(0, 20).map(({ bucket, path, size, contentType }) => ({ bucket, path, size, contentType })),
  base64ReferenceCount: references.filter(reference => reference.kind === 'base64').length,
  referenceCount: references.length,
  backupDir: selectedDir.replace(`${root}\\`, '.\\').replace(`${root}/`, './')
};
await writeFile(resolve(selectedDir, 'summary.json'), JSON.stringify(report, null, 2));
process.stdout.write(`Inventario completado. ${objects.length} objetos; ${inventory.totalBytes} bytes. Respaldo: ${report.backupDir}\n`);
