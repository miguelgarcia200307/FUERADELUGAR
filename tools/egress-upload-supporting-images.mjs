import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stageDir = resolve(root, process.argv[3] || '');
const mode = process.argv[2];
if (!['--dry-run', '--upload'].includes(mode) || !stageDir.startsWith(resolve(root, 'backups') + '\\')) throw new Error('Uso: --dry-run|--upload backups/egress-supporting-images-<timestamp>');
const stage = JSON.parse(await readFile(resolve(stageDir, 'stage-report.json'), 'utf8'));
const backup = JSON.parse(await readFile(resolve(root, stage.backupDir, 'backup-manifest.json'), 'utf8'));
if (stage.projectRef !== 'gacqqaimdfvkmznsglpg' || backup.complete !== true || backup.verifiedCount !== backup.objectCount) throw new Error('Proyecto o respaldo no verificado.');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const md5 = value => createHash('md5').update(value).digest('hex');
const env = mode === '--upload' ? Object.fromEntries((await readFile(resolve(root, '.env.local'), 'utf8')).split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; })) : null;
if (env && (new URL(env.SUPABASE_URL).hostname.split('.')[0] !== stage.projectRef || !env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_'))) throw new Error('Las credenciales no corresponden al proyecto esperado.');
const api = env?.SUPABASE_URL.replace(/\/$/, '');
const headers = env ? { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } : {};
const inventory = new Map(backup.objects.map(row => [`${row.bucket}/${row.path}`, row]));
const records = [];
const route = (bucket, objectPath) => `${bucket}/${objectPath}`.split('/').map(encodeURIComponent).join('/');
async function request(url, init = {}) { return fetch(url, { ...init, signal: AbortSignal.timeout(60_000), headers: { ...headers, ...init.headers } }); }

for (const row of stage.rows.filter(item => !item.skipped)) {
  const key = `${row.bucket}/${row.sourcePath}`;
  const backupObject = inventory.get(key);
  const backupBytes = await readFile(resolve(root, stage.backupDir, row.bucket, ...row.sourcePath.split('/')));
  const local = await readFile(resolve(stageDir, row.localPath));
  const stagedSource = await readFile(resolve(root, 'backups/egress-stage-20261104T024715176Z/originals', row.bucket, ...row.sourcePath.split('/')));
  if (!backupObject || sha256(backupBytes) !== row.sourceBackupSha256 || backupObject.sha256 !== row.sourceBackupSha256
    || sha256(stagedSource) !== row.remoteSourceSha256 || sha256(local) !== row.sha256 || md5(local) !== row.md5) throw new Error(`Checksum local no coincide; se omite y continúa: ${key}`);
  if (mode === '--dry-run') { records.push({ bucket: row.bucket, path: row.variantPath, size: local.length, sha256: row.sha256, status: 'dry-run' }); continue; }
  const sourceResponse = await request(`${api}/storage/v1/object/${route(row.bucket, row.sourcePath)}`);
  if (!sourceResponse.ok) { records.push({ bucket: row.bucket, path: row.variantPath, status: 'omitted-source-fetch', httpStatus: sourceResponse.status }); continue; }
  const remoteSource = Buffer.from(await sourceResponse.arrayBuffer());
  if (sha256(remoteSource) !== row.remoteSourceSha256) { records.push({ bucket: row.bucket, path: row.variantPath, status: 'omitted-source-checksum-mismatch' }); continue; }
  const url = `${api}/storage/v1/object/${route(row.bucket, row.variantPath)}`;
  const existing = await request(url);
  if (existing.ok) {
    const current = Buffer.from(await existing.arrayBuffer());
    records.push({ bucket: row.bucket, path: row.variantPath, status: sha256(current) === row.sha256 ? 'already-current' : 'omitted-existing-different' });
    continue;
  }
  if (existing.status !== 400 && existing.status !== 404) { records.push({ bucket: row.bucket, path: row.variantPath, status: 'omitted-existence-check-failed', httpStatus: existing.status }); continue; }
  if (existing.status === 400) {
    const detail = await existing.text().catch(() => '');
    if (!/NoSuchKey|Object not found|not found/i.test(detail)) { records.push({ bucket: row.bucket, path: row.variantPath, status: 'omitted-existence-check-failed', httpStatus: existing.status, message: detail.slice(0, 180) }); continue; }
  }
  const uploaded = await request(url, { method: 'POST', headers: { 'content-type': 'image/webp', 'cache-control': 'max-age=31536000', 'x-upsert': 'false' }, body: local });
  if (!uploaded.ok) { records.push({ bucket: row.bucket, path: row.variantPath, status: 'upload-failed', httpStatus: uploaded.status, message: (await uploaded.text()).slice(0, 250) }); continue; }
  const publicUrl = `${api}/storage/v1/object/public/${route(row.bucket, row.variantPath)}`;
  const cdn = await fetch(publicUrl, { signal: AbortSignal.timeout(60_000), cache: 'no-store' });
  const cdnBytes = cdn.ok ? Buffer.from(await cdn.arrayBuffer()) : Buffer.alloc(0);
  records.push({ bucket: row.bucket, path: row.variantPath, status: cdn.ok && sha256(cdnBytes) === row.sha256 && cdnBytes.length === local.length ? 'uploaded-cdn-verified' : 'cdn-verification-failed',
    size: cdnBytes.length, sha256: cdn.ok ? sha256(cdnBytes) : null, cacheControl: cdn.headers.get('cache-control'), cfCacheStatus: cdn.headers.get('cf-cache-status'), httpStatus: cdn.status });
}
const report = { mode, projectRef: stage.projectRef, createdAt: new Date().toISOString(), total: records.length,
  verified: records.filter(row => ['dry-run', 'already-current', 'uploaded-cdn-verified'].includes(row.status)).length,
  failures: records.filter(row => !['dry-run', 'already-current', 'uploaded-cdn-verified'].includes(row.status)).length, records };
const output = resolve(stageDir, mode === '--dry-run' ? 'upload-dry-run.json' : 'upload-report.json');
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ mode, total: report.total, verified: report.verified, failures: report.failures, report: output }, null, 2));
if (report.failures) process.exitCode = 1;
