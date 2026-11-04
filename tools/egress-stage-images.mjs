import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const capBytes = 900_000_000;
const backupDir = resolve(root, process.argv[3] || '');
const backupRoot = resolve(root, 'backups');
if (dirname(backupDir) !== backupRoot || !backupDir.split(sep).at(-1).startsWith('originales-')) throw new Error('Indica una carpeta backups/originales-<timestamp> válida.');
if (process.argv[2] !== '--dry-run') throw new Error('Este paso local solo admite --dry-run; no cambia Storage.');
const manifest = JSON.parse(await readFile(resolve(backupDir, 'backup-manifest.json'), 'utf8'));
if (manifest.projectRef !== 'gacqqaimdfvkmznsglpg' || manifest.complete !== true || manifest.verifiedCount !== manifest.objectCount) throw new Error('El respaldo completo de este proyecto no está verificado.');

const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); }
catch {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  const caches = await readdir(cacheRoot, { withFileTypes: true }).catch(() => []);
  for (const cache of caches.filter(item => item.isDirectory())) {
    try { sharp = createRequire(join(cacheRoot, cache.name, 'node_modules', 'sharp', 'package.json'))('sharp'); break; }
    catch { /* Find a cached sharp install without adding it to this project. */ }
  }
}
if (!sharp) throw new Error('sharp no está disponible ni en node_modules ni en la caché npm local.');

const stageDir = resolve(root, process.argv[4] || `backups/egress-stage-${manifest.capturedAt.replace(/[-:.]/g, '').replace('T', 'T').replace(/Z$/, 'Z')}`);
if (!stageDir.startsWith(backupRoot + sep) || stageDir === backupDir) throw new Error('La etapa debe estar bajo backups/ y separada del respaldo.');
await mkdir(stageDir, { recursive: false });
const originalStage = resolve(stageDir, 'originals');
const variantsStage = resolve(stageDir, 'variants');
await mkdir(originalStage, { recursive: true });
await mkdir(variantsStage, { recursive: true });

const hashBuffer = buffer => ({ size: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), md5: createHash('md5').update(buffer).digest('hex') });
async function hashFile(path) {
  const sha = createHash('sha256');
  const md5 = createHash('md5');
  let size = 0;
  for await (const chunk of createReadStream(path)) { size += chunk.length; sha.update(chunk); md5.update(chunk); }
  return { size, sha256: sha.digest('hex'), md5: md5.digest('hex') };
}
function shouldSkipSvg(object) {
  return object.bucket === 'team-crests' && object.path.startsWith('demo/') && object.contentType === 'image/svg+xml';
}
function outputForFormat(image, format) {
  if (format === 'jpeg') return image.jpeg({ quality: 85, mozjpeg: true, progressive: true }).toBuffer();
  if (format === 'png') return image.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
  if (format === 'webp') return image.webp({ quality: 85, effort: 6 }).toBuffer();
  if (format === 'avif') return image.avif({ quality: 85, effort: 6 }).toBuffer();
  throw new Error(`Formato no permitido: ${format}`);
}

const objects = manifest.objects;
const results = new Array(objects.length);
let cursor = 0;
let finished = 0;
const concurrency = 4;
async function worker() {
  while (cursor < objects.length) {
    const index = cursor++;
    const object = objects[index];
    const backupPath = resolve(backupDir, object.bucket, ...object.path.split('/'));
    try {
      const backupHash = await hashFile(backupPath);
      if (backupHash.size !== object.size || backupHash.sha256 !== object.sha256 || backupHash.md5 !== object.md5) throw new Error('Checksum del respaldo no coincide.');
      if (shouldSkipSvg(object)) {
        results[index] = { bucket: object.bucket, path: object.path, contentType: object.contentType, before: { size: object.size, sha256: object.sha256, md5: object.md5 }, after: { size: object.size, sha256: object.sha256, md5: object.md5 }, skipped: true, skipReason: 'SVG demo protegido por instrucción.' };
        continue;
      }
      const bytes = await readFile(backupPath);
      const input = sharp(bytes, { failOn: 'error', limitInputPixels: 240_000_000 });
      const metadata = await input.metadata();
      const format = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[object.contentType];
      if (!['jpeg', 'png', 'webp', 'avif'].includes(format)) throw new Error(`Content type no compatible con imagen raster: ${object.contentType}`);
      if (format === 'avif' && metadata.format !== 'heif') throw new Error(`AVIF inesperado: sharp identificó ${metadata.format}.`);
      if (format !== 'avif' && metadata.format !== format) throw new Error(`Content type ${object.contentType} no coincide con ${metadata.format}.`);
      const image = sharp(bytes, { failOn: 'error', limitInputPixels: 240_000_000 })
        .rotate()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true });
      const compressed = await outputForFormat(image, format);
      const useOriginal = compressed.length >= bytes.length;
      const originalBytes = useOriginal ? bytes : compressed;
      const originalHash = hashBuffer(originalBytes);
      const originalFile = resolve(originalStage, object.bucket, ...object.path.split('/'));
      await mkdir(dirname(originalFile), { recursive: true });
      await writeFile(originalFile, originalBytes);
      const after = { ...originalHash, contentType: object.contentType, width: useOriginal ? metadata.width : undefined, height: useOriginal ? metadata.height : undefined };
      if (!useOriginal) {
        const resized = await sharp(compressed, { failOn: 'error', limitInputPixels: 240_000_000 }).metadata();
        after.width = resized.width;
        after.height = resized.height;
      }
      const variants = [];
      if (object.bucket === 'product-images') {
        for (const [sizeName, width] of [['thumb', 400], ['md', 800], ['lg', 1200]]) {
          const output = await sharp(originalBytes, { failOn: 'error', limitInputPixels: 240_000_000 })
            .rotate()
            .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 78, effort: 6 })
            .toBuffer();
          if (output.length >= originalBytes.length) {
            variants.push({ sizeName, width, skipped: true, skipReason: 'La variante WebP no pesa menos que el original optimizado.' });
            continue;
          }
          const sourceNoExt = object.path.replace(/\.[^.]+$/, '');
          const variantPath = `optimized/${sizeName}/${sourceNoExt}.webp`;
          const variantFile = resolve(variantsStage, object.bucket, ...variantPath.split('/'));
          await mkdir(dirname(variantFile), { recursive: true });
          await writeFile(variantFile, output);
          variants.push({ sizeName, width, path: variantPath, stageRelativePath: relative(stageDir, variantFile), ...hashBuffer(output), contentType: 'image/webp' });
        }
      }
      results[index] = {
        bucket: object.bucket, path: object.path, contentType: object.contentType,
        backupRelativePath: object.backupRelativePath,
        originalStageRelativePath: relative(stageDir, originalFile),
        before: { size: object.size, sha256: object.sha256, md5: object.md5 },
        after, keptOriginalBecauseLarger: useOriginal, variants
      };
    } catch (error) {
      results[index] = { bucket: object.bucket, path: object.path, contentType: object.contentType, before: { size: object.size, sha256: object.sha256, md5: object.md5 }, skipped: true, skipReason: String(error.message || error) };
    } finally {
      finished += 1;
      if (finished % 50 === 0 || finished === objects.length) process.stdout.write(`Procesamiento local ${finished}/${objects.length}\n`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const objectResults = results.filter(Boolean);
const originalBytesAfter = objectResults.reduce((sum, row) => sum + (row.after?.size ?? row.before.size), 0);
const variantRows = objectResults.flatMap(row => row.variants || []).filter(row => !row.skipped);
const variantBytes = variantRows.reduce((sum, row) => sum + row.size, 0);
const projectedTotalBytes = originalBytesAfter + variantBytes;
const totalBeforeBytes = manifest.totalBytes;
const report = {
  projectRef: manifest.projectRef,
  sourceBackupDir: relative(root, backupDir),
  stageDir: relative(root, stageDir),
  processedAt: new Date().toISOString(),
  sharpVersion: sharp.versions.sharp,
  totalBeforeBytes,
  originalBytesAfter,
  variantCount: variantRows.length,
  variantBytes,
  projectedTotalBytes,
  capBytes,
  underCap: projectedTotalBytes < capBytes,
  processedObjectCount: objectResults.filter(row => !row.skipped).length,
  skippedObjectCount: objectResults.filter(row => row.skipped).length,
  skippedObjects: objectResults.filter(row => row.skipped).map(row => ({ bucket: row.bucket, path: row.path, reason: row.skipReason })),
  originals: objectResults,
  variants: variantRows.map(({ bucket, path, sizeName, width, ...rest }) => ({ bucket: 'product-images', original: path.replace(`optimized/${sizeName}/`, ''), sizeName, width, variantPath: path, ...rest }))
};
await writeFile(resolve(stageDir, 'dry-run-report.json'), JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({
  projectRef: report.projectRef, sourceBackupDir: report.sourceBackupDir, stageDir: report.stageDir,
  sharpVersion: report.sharpVersion, totalBeforeBytes, originalBytesAfter, originalSavingsBytes: totalBeforeBytes - originalBytesAfter,
  variantCount: report.variantCount, variantBytes, projectedTotalBytes, capBytes, underCap: report.underCap,
  processedObjectCount: report.processedObjectCount, skippedObjectCount: report.skippedObjectCount,
  biggestVariantBytes: Math.max(0, ...variantRows.map(row => row.size))
}, null, 2));
