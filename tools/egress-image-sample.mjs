import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backupNames = (await readdir(resolve(root, 'backups'), { withFileTypes: true }))
  .filter(item => item.isDirectory()).map(item => item.name).sort().reverse();
let backupDir;
for (const name of backupNames) {
  const candidate = resolve(root, 'backups', name);
  try { await readFile(resolve(candidate, 'storage-inventory.json')); backupDir = candidate; break; }
  catch { /* Continue until a complete Storage inventory is found. */ }
}
if (!backupDir) throw new Error('No hay inventario de Storage completo.');

const database = JSON.parse(await readFile(resolve(backupDir, 'database-public.json'), 'utf8'));
const inventory = JSON.parse(await readFile(resolve(backupDir, 'storage-inventory.json'), 'utf8'));
const referenced = new Set();
for (const row of database.tables.product_images || []) {
  try {
    const pathname = decodeURIComponent(new URL(row.url).pathname);
    const match = pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/product-images\/(.+)$/);
    if (match) referenced.add(match[1]);
  } catch { /* Ignore non-Storage image URLs. */ }
}
const images = inventory.objects.filter(object => object.bucket === 'product-images' && referenced.has(object.path)).sort((a, b) => a.size - b.size);
if (!images.length) throw new Error('No se hallaron imágenes de producto referenciadas.');
const quantiles = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, .97, 1];
const sample = [...new Set(quantiles.map(q => images[Math.round(q * (images.length - 1))]))];
const sampleDir = resolve(backupDir, 'sample-originals');
await mkdir(sampleDir, { recursive: true });
const mapping = [];
for (const [index, object] of sample.entries()) {
  const extension = object.path.split('.').pop().toLowerCase() || 'bin';
  const filename = `sample-${String(index + 1).padStart(2, '0')}.${extension}`;
  const response = await fetch(`https://gacqqaimdfvkmznsglpg.supabase.co/storage/v1/object/public/product-images/${object.path.split('/').map(encodeURIComponent).join('/')}`, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`No se pudo descargar una muestra (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(resolve(sampleDir, filename), bytes);
  mapping.push({ bucket: object.bucket, original: object.path, sample: filename, originalBytes: object.size, downloadedBytes: bytes.length });
}
await writeFile(resolve(backupDir, 'sample-mapping.json'), JSON.stringify(mapping, null, 2));
process.stdout.write(JSON.stringify({ sampleCount: mapping.length, totalDownloadedBytes: mapping.reduce((sum, row) => sum + row.downloadedBytes, 0), sampleDir: sampleDir.replace(`${root}\\`, '.\\').replace(`${root}/`, './'), mapping }, null, 2));
