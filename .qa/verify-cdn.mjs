import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stage = resolve(root, 'backups/egress-stage-20261104T024715176Z');
const report = JSON.parse(await readFile(resolve(stage, 'dry-run-report.json'), 'utf8'));
const env = Object.fromEntries((await readFile(resolve(root, '.env.local'), 'utf8')).split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const base = env.SUPABASE_URL.replace(/\/$/, '');
const checks = [];
for (const row of report.originals) {
  if (row.skipped) continue;
  checks.push({ bucket: row.bucket, path: row.path, file: resolve(stage, row.originalStageRelativePath), expected: row.after });
  for (const variant of row.variants || []) if (!variant.skipped) checks.push({ bucket: row.bucket, path: variant.path, file: resolve(stage, variant.stageRelativePath), expected: variant });
}
const results = new Array(checks.length); let cursor = 0, done = 0;
const md5 = bytes => createHash('md5').update(bytes).digest('hex');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function url(item, nonce) { const path = [item.bucket, ...item.path.split('/')].map(encodeURIComponent).join('/'); return `${base}/storage/v1/object/public/${path}${nonce ? `?cacheNonce=${nonce}` : ''}`; }
async function check(item, nonce = '') {
  const response = await fetch(url(item, nonce), { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = { size: bytes.length, md5: md5(bytes), sha256: sha256(bytes), contentType: response.headers.get('content-type')?.split(';')[0] };
  if (actual.size !== item.expected.size || actual.sha256 !== item.expected.sha256 || actual.contentType !== item.expected.contentType) throw new Error(`CDN mismatch: ${actual.size}/${item.expected.size}, ${actual.contentType}/${item.expected.contentType}, ${actual.sha256}/${item.expected.sha256}`);
  return actual;
}
async function worker() {
  while (cursor < checks.length) {
    const index = cursor++, item = checks[index];
    try {
      const actual = await check(item);
      const local = JSON.parse(JSON.stringify(item.expected));
      if (actual.sha256 !== local.sha256) throw new Error('Checksum CDN no coincide con staging.');
      results[index] = { bucket: item.bucket, path: item.path, verified: true, ...actual };
    } catch (first) {
      try { const actual = await check(item, `egress-v2-20261104-${Date.now()}`); results[index] = { bucket: item.bucket, path: item.path, verified: true, retriedWithCacheNonce: true, ...actual }; }
      catch (second) { results[index] = { bucket: item.bucket, path: item.path, verified: false, error: String(second.message || second), firstError: String(first.message || first) }; }
    }
    done += 1;
    if (done % 100 === 0 || done === checks.length) process.stdout.write(`CDN ${done}/${checks.length}\n`);
  }
}
await Promise.all(Array.from({ length: 10 }, worker));
const final = { projectRef: report.projectRef, checkedAt: new Date().toISOString(), count: results.length, verified: results.filter(item => item.verified).length, failures: results.filter(item => !item.verified), results };
await writeFile(resolve(stage, 'cdn-verification.json'), JSON.stringify(final, null, 2));
process.stdout.write(JSON.stringify({ count: final.count, verified: final.verified, failures: final.failures.length, report: 'cdn-verification.json' }, null, 2));
