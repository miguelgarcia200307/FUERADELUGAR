import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedProject = 'gacqqaimdfvkmznsglpg';
const concurrency = 8;
const backupDir = resolve(root, process.argv[2] || '');
if (dirname(backupDir) !== resolve(root, 'backups') || !backupDir.split(sep).at(-1).startsWith('originales-')) throw new Error('Ruta de respaldo no permitida.');
const envText = await readFile(resolve(root, '.env.local'), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const split = line.indexOf('=');
  return [line.slice(0, split), line.slice(split + 1)];
}));
if (new URL(env.SUPABASE_URL).hostname.split('.')[0] !== expectedProject) throw new Error('El URL no corresponde al proyecto esperado.');
if (!env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) throw new Error('Falta SUPABASE_SECRET_KEY.');
const base = env.SUPABASE_URL.replace(/\/$/, '');
const headers = { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
const inventory = JSON.parse(await readFile(resolve(backupDir, 'remote-inventory.json'), 'utf8'));
if (inventory.projectRef !== expectedProject) throw new Error('El inventario guardado pertenece a otro proyecto.');

function normalizedEtag(value = '') {
  return String(value).trim().replace(/^W\//i, '').replace(/^"|"$/g, '').toLowerCase();
}
async function hashFile(path) {
  const sha = createHash('sha256');
  const md5 = createHash('md5');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    sha.update(chunk);
    md5.update(chunk);
  }
  return { size, sha256: sha.digest('hex'), md5: md5.digest('hex') };
}

const verified = new Array(inventory.objects.length);
const omissions = [];
let next = 0;
let done = 0;
async function verifyWorker() {
  while (next < inventory.objects.length) {
    const index = next++;
    const object = inventory.objects[index];
    const target = resolve(backupDir, object.bucket, ...object.path.split('/'));
    const rel = relative(backupDir, target);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) {
      omissions.push({ bucket: object.bucket, path: object.path, reason: 'Ruta fuera del respaldo.' });
      continue;
    }
    try {
      await mkdir(dirname(target), { recursive: true });
      let local;
      try { local = await hashFile(target); } catch { local = null; }
      if (!local || local.size !== object.size || local.md5 !== object.etag) {
        const tempPath = `${target}.partial-${randomUUID()}`;
        let lastError;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            const path = `/storage/v1/object/authenticated/${encodeURIComponent(object.bucket)}/${object.path.split('/').map(encodeURIComponent).join('/')}`;
            const response = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(120_000) });
            if (!response.ok || !response.body) throw new Error(`API HTTP ${response.status}`);
            const sha = createHash('sha256');
            const md5 = createHash('md5');
            let size = 0;
            const meter = new Transform({ transform(chunk, _encoding, callback) {
              size += chunk.length;
              sha.update(chunk);
              md5.update(chunk);
              callback(null, chunk);
            } });
            await pipeline(Readable.fromWeb(response.body), meter, (await import('node:fs')).createWriteStream(tempPath, { flags: 'w' }));
            const downloaded = { size, sha256: sha.digest('hex'), md5: md5.digest('hex') };
            if (downloaded.size !== object.size) throw new Error(`Tamaño remoto ${downloaded.size}, inventario ${object.size}.`);
            if (downloaded.md5 !== object.etag) throw new Error(`MD5 remoto ${downloaded.md5}, ETag ${object.etag}.`);
            await rename(tempPath, target);
            local = downloaded;
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            await import('node:fs/promises').then(fs => fs.rm(tempPath, { force: true })).catch(() => {});
            await new Promise(resolveDelay => setTimeout(resolveDelay, 400 * 2 ** attempt));
          }
        }
        if (lastError) throw lastError;
      }
      const reread = await hashFile(target);
      if (reread.size !== object.size || reread.md5 !== object.etag) throw new Error('Verificación SHA local/MD5 remoto no coincide.');
      verified[index] = { ...object, ...reread, backupRelativePath: `${object.bucket}/${object.path}` };
    } catch (error) {
      omissions.push({ bucket: object.bucket, path: object.path, reason: String(error.message || error) });
    }
    done += 1;
    if (done % 50 === 0 || done === inventory.objects.length) process.stdout.write(`Verificados ${done}/${inventory.objects.length}\n`);
  }
}

await Promise.all(Array.from({ length: concurrency }, verifyWorker));
const verifiedObjects = verified.filter(Boolean);
const manifest = {
  projectRef: expectedProject,
  capturedAt: inventory.capturedAt,
  verifiedAt: new Date().toISOString(),
  objectCount: inventory.objects.length,
  verifiedCount: verifiedObjects.length,
  totalBytes: verifiedObjects.reduce((sum, object) => sum + object.size, 0),
  checksumAlgorithm: 'SHA-256 local (stream + re-read), MD5 checked against remote Storage ETag',
  complete: omissions.length === 0,
  objects: verifiedObjects,
  omissions
};
await writeFile(resolve(backupDir, 'backup-manifest.json'), JSON.stringify(manifest, null, 2));
await writeFile(resolve(backupDir, 'backup-complete.json'), JSON.stringify({ projectRef: expectedProject, expectedObjectCount: inventory.objects.length, verifiedObjectCount: verifiedObjects.length, verifiedBytes: manifest.totalBytes, complete: manifest.complete, omissions }, null, 2));
process.stdout.write(JSON.stringify({ projectRef: expectedProject, backupDir: relative(root, backupDir), expectedObjectCount: inventory.objects.length, verifiedObjectCount: verifiedObjects.length, totalVerifiedBytes: manifest.totalBytes, omissions: omissions.length, complete: manifest.complete }, null, 2));
