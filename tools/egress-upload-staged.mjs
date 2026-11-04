import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backupDir = resolve(root, 'backups/originales-20261104T024429977Z');
const stageDir = resolve(root, 'backups/egress-stage-20261104T024715176Z');
const mode = process.argv[2];
if (!['--dry-run', '--test10', '--rest'].includes(mode)) throw new Error('Uso: --dry-run | --test10 | --rest');
const report = JSON.parse(await readFile(resolve(stageDir, 'dry-run-report.json'), 'utf8'));
const testSet = JSON.parse(await readFile(resolve(stageDir, 'test-set.json'), 'utf8'));
const backup = JSON.parse(await readFile(resolve(backupDir, 'backup-manifest.json'), 'utf8'));
if (report.projectRef !== 'gacqqaimdfvkmznsglpg' || backup.complete !== true || backup.verifiedCount !== backup.objectCount) throw new Error('Respaldo/staging no verificado para el proyecto esperado.');
const envText = await readFile(resolve(root, '.env.local'), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
if (new URL(env.SUPABASE_URL).hostname.split('.')[0] !== report.projectRef || !env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) throw new Error('Credenciales ausentes o proyecto incorrecto.');
const base = env.SUPABASE_URL.replace(/\/$/, '');
const headers = { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
const byOriginal = new Map(report.originals.map(row => [`${row.bucket}/${row.path}`, row]));
const testKeys = new Set(testSet.objects.map(row => `product-images/${row.path}`));
const inventory = new Map(backup.objects.map(row => [`${row.bucket}/${row.path}`, row]));
const records = [];

async function hashFile(path) {
  const sha = createHash('sha256'), md5 = createHash('md5'); let size = 0;
  for await (const chunk of createReadStream(path)) { size += chunk.length; sha.update(chunk); md5.update(chunk); }
  return { size, sha256: sha.digest('hex'), md5: md5.digest('hex') };
}
function encodedPath(bucket, path) { return [bucket, ...path.split('/')].map(encodeURIComponent).join('/'); }
async function request(url, init = {}) { return fetch(url, { ...init, signal: AbortSignal.timeout(60_000), headers: { ...headers, ...init.headers } }); }
async function remoteHash(bucket, path) {
  const response = await request(`${base}/storage/v1/object/authenticated/${encodedPath(bucket, path)}`, { method: 'HEAD' });
  if (response.status === 404) return { exists: false };
  if (response.status === 400) {
    const check = await request(`${base}/storage/v1/object/authenticated/${encodedPath(bucket, path)}`);
    if (check.status === 404) return { exists: false };
    if (check.status === 400) {
      const body = await check.text();
      if (/NoSuchKey|not_found|Object not found/i.test(body)) return { exists: false };
      throw new Error(`lectura remota HTTP 400: ${body.slice(0, 160)}`);
    }
    if (!check.ok) throw new Error(`lectura remota HTTP ${check.status}`);
    const bytes = Buffer.from(await check.arrayBuffer());
    return { exists: true, ...hashBuffer(bytes), contentType: check.headers.get('content-type')?.split(';')[0] };
  }
  if (!response.ok) throw new Error(`lectura remota HTTP ${response.status}`);
  const etag = (response.headers.get('etag') || '').replace(/^W\//, '').replace(/^"|"$/g, '').toLowerCase();
  return { exists: true, size: Number(response.headers.get('content-length')), md5: /^[a-f0-9]{32}$/.test(etag) ? etag : null, contentType: response.headers.get('content-type')?.split(';')[0] };
}
function hashBuffer(bytes) { return { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), md5: createHash('md5').update(bytes).digest('hex') }; }
async function upload(bucket, path, file, expected, contentType) {
  const local = await hashFile(file);
  if (local.sha256 !== expected.sha256 || local.size !== expected.size) throw new Error('checksum local no coincide con staging');
  const remote = await remoteHash(bucket, path);
  const prior = inventory.get(`${bucket}/${path}`);
  if (prior) {
    if (remote.exists && remote.md5 === expected.md5 && remote.size === expected.size) return 'already-current';
    if (remote.exists && remote.md5 === prior.md5 && remote.size === prior.size) {
      // The remote object is still the exact, fully verified backup; it is safe to replace.
    } else if (!remote.exists || remote.md5 !== prior.md5 || remote.size !== prior.size) throw new Error(`objeto remoto difiere del inventario respaldado (${remote.size}/${prior.size}, ${remote.md5}/${prior.md5})`);
  } else if (remote.exists && (remote.md5 !== expected.md5 || remote.size !== expected.size)) throw new Error('destino de variante ya existe con contenido distinto');
  if (mode === '--dry-run') return 'would-upload';
  const bytes = await readFile(file);
  const response = await request(`${base}/storage/v1/object/${encodedPath(bucket, path)}`, {
    method: 'POST', body: bytes,
    headers: { 'content-type': contentType, 'cache-control': '31536000', 'x-upsert': 'true' }
  });
  if (!response.ok) throw new Error(`subida HTTP ${response.status}`);
  return 'uploaded';
}

const selected = report.originals.filter(row => !row.skipped && (mode !== '--test10' || testKeys.has(`${row.bucket}/${row.path}`)) && (mode !== '--rest' || !testKeys.has(`${row.bucket}/${row.path}`)));
let cursor = 0, completed = 0;
async function worker() {
  while (cursor < selected.length) {
    const index = cursor++, row = selected[index], key = `${row.bucket}/${row.path}`;
    if (mode === '--dry-run') records[index] = { bucket: row.bucket, path: row.path, result: 'would-upload', variants: (row.variants || []).filter(item => !item.skipped).map(item => ({ path: item.path, result: 'would-upload' })) };
    else try {
      const remoteOriginal = inventory.get(key);
      if (!remoteOriginal || remoteOriginal.size !== row.before.size || remoteOriginal.sha256 !== row.before.sha256 || remoteOriginal.md5 !== row.before.md5) throw new Error('inventario y dry-run difieren');
      const backupFile = resolve(backupDir, row.bucket, ...row.path.split('/'));
      const backupHash = await hashFile(backupFile);
      if (backupHash.size !== row.before.size || backupHash.sha256 !== row.before.sha256 || backupHash.md5 !== row.before.md5) throw new Error('checksum del respaldo no coincide');
      const originalResult = await upload(row.bucket, row.path, resolve(stageDir, row.originalStageRelativePath), row.after, row.contentType);
      const variants = [];
      for (const variant of row.variants || []) if (!variant.skipped) variants.push({ path: variant.path, result: await upload(row.bucket, variant.path, resolve(stageDir, variant.stageRelativePath), variant, 'image/webp') });
      records[index] = { bucket: row.bucket, path: row.path, result: originalResult, variants };
    } catch (error) { records[index] = { bucket: row.bucket, path: row.path, skipped: String(error.message || error) }; }
    completed += 1;
    if (completed % 25 === 0 || completed === selected.length) process.stdout.write(`${mode} ${completed}/${selected.length}\n`);
  }
}
await Promise.all(Array.from({ length: Math.min(8, selected.length) }, worker));
const result = { projectRef: report.projectRef, mode, completedAt: new Date().toISOString(), total: selected.length, uploaded: records.filter(row => row.result === 'uploaded').length, skipped: records.filter(row => row.skipped), records };
const suffix = mode === '--test10' ? 'test10' : mode === '--rest' ? 'rest' : 'dry-run';
await writeFile(resolve(stageDir, `upload-${suffix}.json`), JSON.stringify(result, null, 2));
process.stdout.write(JSON.stringify({ mode, total: result.total, uploaded: result.uploaded, skipped: result.skipped.length, report: `upload-${suffix}.json` }, null, 2));
