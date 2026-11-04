import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backupDir = resolve(root, process.argv[2] || '');
const stageDir = resolve(root, process.argv[3] || '');
const copyLocal = process.argv[4] === '--copy-local';
const backupRoot = resolve(root, 'backups');
if (dirname(backupDir) !== backupRoot || !backupDir.split(sep).at(-1).startsWith('originales-')) throw new Error('Indica backups/originales-<timestamp>.');
if (!stageDir.startsWith(backupRoot + sep) || stageDir === backupDir) throw new Error('La etapa debe ser otra carpeta bajo backups/.');
const manifest = JSON.parse(await readFile(resolve(backupDir, 'backup-manifest.json'), 'utf8'));
if (manifest.projectRef !== 'gacqqaimdfvkmznsglpg' || manifest.complete !== true || manifest.verifiedCount !== manifest.objectCount) throw new Error('El respaldo completo del proyecto no está verificado.');
const baselineDir = resolve(root, 'backups/egress-stage-20261104T024715176Z');
const baseline = JSON.parse(await readFile(resolve(baselineDir, 'dry-run-report.json'), 'utf8'));
if (baseline.projectRef !== manifest.projectRef) throw new Error('La etapa base no corresponde al mismo proyecto.');
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); }
catch {
  const { homedir } = await import('node:os');
  const { readdir } = await import('node:fs/promises');
  const cacheRoot = resolve(homedir(), 'AppData/Local/npm-cache/_npx');
  for (const cache of await readdir(cacheRoot, { withFileTypes: true }).catch(() => [])) {
    try { sharp = createRequire(resolve(cacheRoot, cache.name, 'node_modules/sharp/package.json'))('sharp'); break; }
    catch { /* Search cached npx installs without changing project dependencies. */ }
  }
}
if (!sharp) throw new Error('sharp no está disponible.');

const sha256 = value => createHash('sha256').update(value).digest('hex');
const md5 = value => createHash('md5').update(value).digest('hex');
const baselineObjects = new Map(baseline.originals.map(row => [`${row.bucket}/${row.path}`, row]));
const candidates = manifest.objects.filter(object => ['category-images', 'team-crests'].includes(object.bucket)
  && object.contentType.startsWith('image/') && /\.(?:jpe?g|png|webp|avif)$/i.test(object.path));
await mkdir(stageDir, { recursive: true });
await mkdir(resolve(stageDir, 'variants'), { recursive: true });
const rows = [];
for (const object of candidates) {
  const backupPath = resolve(backupDir, object.bucket, ...object.path.split('/'));
  const backupBytes = await readFile(backupPath);
  if (backupBytes.length !== object.size || sha256(backupBytes) !== object.sha256 || md5(backupBytes) !== object.md5) throw new Error(`Respaldo no verificable; no se procesa: ${object.bucket}/${object.path}`);
  const baselineRow = baselineObjects.get(`${object.bucket}/${object.path}`);
  if (!baselineRow?.after?.sha256 || baselineRow.skipped) throw new Error(`No hay versión transformada verificable: ${object.bucket}/${object.path}`);
  const sourcePath = resolve(baselineDir, 'originals', object.bucket, ...object.path.split('/'));
  const source = await readFile(sourcePath);
  if (source.length !== baselineRow.after.size || sha256(source) !== baselineRow.after.sha256) throw new Error(`La versión de trabajo no coincide con la huella verificada: ${object.bucket}/${object.path}`);
  const width = object.bucket === 'category-images' ? 480 : 180;
  const output = await sharp(source, { failOn: 'error', limitInputPixels: 240_000_000 })
    .rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, effort: 6 }).toBuffer();
  if (output.length >= source.length) {
    rows.push({ bucket: object.bucket, sourcePath: object.path, skipped: true, reason: 'La variante no pesa menos que el original.', beforeBytes: source.length, afterBytes: output.length });
    continue;
  }
  const extensionless = object.path.replace(/\.[^.]+$/, '');
  const variantPath = `optimized/thumb/${extensionless}.webp`;
  const localPath = resolve(stageDir, 'variants', object.bucket, ...variantPath.split('/'));
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, output);
  if (copyLocal) {
    const destination = resolve(root, 'assets/images/storage-optimized', object.bucket, ...variantPath.split('/'));
    if (!destination.startsWith(resolve(root, 'assets/images/storage-optimized') + sep)) throw new Error(`Ruta local fuera del destino esperado: ${object.bucket}/${variantPath}`);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(localPath, destination);
  }
  rows.push({ bucket: object.bucket, sourcePath: object.path, sourceSha256: sha256(source), sourceBytes: source.length,
    sourceBackupSha256: object.sha256, remoteSourceSha256: baselineRow.after.sha256,
    variantPath, localPath: relative(stageDir, localPath), contentType: 'image/webp', width,
    beforeBytes: source.length, afterBytes: output.length, sha256: sha256(output), md5: md5(output) });
}
const report = { projectRef: manifest.projectRef, backupDir: relative(root, backupDir), stageDir: relative(root, stageDir),
  generatedAt: new Date().toISOString(), candidates: candidates.length, variants: rows.filter(row => !row.skipped).length,
  skipped: rows.filter(row => row.skipped).length, beforeBytes: rows.reduce((sum, row) => sum + row.beforeBytes, 0),
  afterBytes: rows.reduce((sum, row) => sum + row.afterBytes, 0), rows };
await writeFile(resolve(stageDir, 'stage-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ projectRef: report.projectRef, candidates: report.candidates, variants: report.variants,
  skipped: report.skipped, beforeBytes: report.beforeBytes, afterBytes: report.afterBytes, report: resolve(stageDir, 'stage-report.json') }, null, 2));
