import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backups = (await readdir(resolve(root, 'backups'), { withFileTypes: true }))
  .filter(item => item.isDirectory()).map(item => item.name).sort().reverse();
let backupDir;
for (const name of backups) {
  const candidate = resolve(root, 'backups', name);
  try {
    await readFile(resolve(candidate, 'database-public.json'));
    await readFile(resolve(candidate, 'storage-inventory.json'));
    backupDir = candidate;
    break;
  } catch { /* Select only a completed snapshot. */ }
}
if (!backupDir) throw new Error('No se encontró un respaldo completo de DB y Storage.');

const database = JSON.parse(await readFile(resolve(backupDir, 'database-public.json'), 'utf8'));
const inventory = JSON.parse(await readFile(resolve(backupDir, 'storage-inventory.json'), 'utf8'));
const references = [];
for (const [table, rows] of Object.entries(database.tables)) {
  for (const row of rows) for (const [column, value] of Object.entries(row)) {
    if (typeof value !== 'string' || !value.includes('.supabase.co/storage/v1/object/')) continue;
    try {
      const pathname = decodeURIComponent(new URL(value).pathname);
      const match = pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
      if (match) references.push({ bucket: match[1], path: match[2], table, rowId: row.id ?? null, column });
    } catch { /* Ignore malformed stored URLs in the audit; keep their source backup intact. */ }
  }
}

const refCounts = new Map();
for (const reference of references) {
  const key = `${reference.bucket}/${reference.path}`;
  refCounts.set(key, (refCounts.get(key) || 0) + 1);
}
async function sourceFiles(directory = root, found = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!['.git', '.qa', 'backups', 'node_modules'].includes(entry.name)) await sourceFiles(resolve(directory, entry.name), found);
    } else if (/\.(?:html?|css|js|mjs|sql|json)$/i.test(entry.name)) found.push(resolve(directory, entry.name));
  }
  return found;
}
const sourceText = (await Promise.all((await sourceFiles()).map(file => readFile(file, 'utf8').catch(() => '')))).join('\n').toLowerCase();
const perBucket = inventory.buckets.map(bucket => {
  const files = inventory.objects.filter(object => object.bucket === bucket.id);
  const referenced = files.filter(object => refCounts.has(`${bucket.id}/${object.path}`));
  const unreferenced = files.filter(object => !refCounts.has(`${bucket.id}/${object.path}`));
  return {
    bucket: bucket.id,
    files: files.length,
    referencedFiles: referenced.length,
    unreferencedFiles: unreferenced.length,
    referencedBytes: referenced.reduce((sum, object) => sum + object.size, 0),
    unreferencedBytes: unreferenced.reduce((sum, object) => sum + object.size, 0),
    unreferenced: unreferenced.sort((a, b) => b.size - a.size).map(({ path, size, contentType }) => ({
      path,
      size,
      contentType,
      referencedInSource: sourceText.includes(`${bucket.id}/${path}`.toLowerCase())
        || sourceText.includes(`${bucket.id}/${path.split('/')[0]}/`.toLowerCase())
    }))
  };
});

const report = {
  projectRef: inventory.projectRef,
  backupDir: backupDir.replace(`${root}\\`, '.\\').replace(`${root}/`, './'),
  dbRows: Object.fromEntries(Object.entries(database.tables).map(([name, rows]) => [name, rows.length])),
  storageBytes: inventory.totalBytes,
  storageGBDecimal: Number((inventory.totalBytes / 1_000_000_000).toFixed(4)),
  storageGiB: Number((inventory.totalBytes / 1_073_741_824).toFixed(4)),
  imageCount: inventory.objects.filter(object => /^image\//i.test(object.contentType || '') || /\.(?:jpe?g|png|webp|gif|avif|svg)$/i.test(object.path)).length,
  imageBytes: inventory.objects.filter(object => /^image\//i.test(object.contentType || '') || /\.(?:jpe?g|png|webp|gif|avif|svg)$/i.test(object.path)).reduce((sum, object) => sum + object.size, 0),
  dbStorageUrlReferences: references.length,
  distinctDbStorageObjects: refCounts.size,
  duplicateDbReferences: references.length - refCounts.size,
  buckets: perBucket
};
process.stdout.write(JSON.stringify(report, null, 2));
