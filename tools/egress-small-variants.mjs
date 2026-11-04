// Generates the small image variants used where the existing ones were larger
// than what is displayed:
//   - category quick-access icons (home, 41-48 CSS px): 128 px WebP
//   - team crests (45-86 CSS px): 96 px WebP (180 px thumb stays for larger/HiDPI)
//   - header/footer brand logo: 240 / 420 px WebP (600 px stays for DPR 3)
//   - favicon 64 px PNG and apple-touch-icon 180 px PNG (instead of the 52 KB 256 px icon)
//   - homepage desktop banners: 1280 px WebP stored next to the original in
//     banner-images as home/<uuid>-1280.webp (allowed by the existing Storage policy)
// Usage:
//   node tools/egress-small-variants.mjs --local            writes local assets only
//   node tools/egress-small-variants.mjs --banners-dry-run  stages banner variants under backups/
//   node tools/egress-small-variants.mjs --banners-upload   uploads staged banner variants (never overwrites)
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (!['--local', '--banners-dry-run', '--banners-upload'].includes(mode)) throw new Error('Uso: --local | --banners-dry-run | --banners-upload');
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); }
catch {
  const { homedir } = await import('node:os');
  const cacheRoot = resolve(homedir(), 'AppData/Local/npm-cache/_npx');
  for (const cache of await readdir(cacheRoot, { withFileTypes: true }).catch(() => [])) {
    try { sharp = createRequire(resolve(cacheRoot, cache.name, 'node_modules/sharp/package.json'))('sharp'); break; }
    catch { /* keep searching cached npx installs without adding project dependencies */ }
  }
}
if (!sharp) throw new Error('No se encontró sharp.');
const sha256 = value => createHash('sha256').update(value).digest('hex');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full)); else out.push(full);
  }
  return out;
}

if (mode === '--local') {
  const report = [];
  const storageRoot = resolve(root, 'assets/images/storage-optimized');
  for (const [bucket, size] of [['category-images', 128], ['team-crests', 96]]) {
    const thumbRoot = resolve(storageRoot, bucket, 'optimized/thumb');
    for (const source of (await walk(thumbRoot)).filter(file => file.endsWith('.webp'))) {
      const target = resolve(storageRoot, bucket, 'optimized/icon', relative(thumbRoot, source));
      const output = await sharp(await readFile(source)).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, output);
      report.push({ source: relative(root, source), target: relative(root, target), before: (await readFile(source)).length, after: output.length });
    }
  }
  const brand = await readFile(resolve(root, 'img/brand.webp'));
  for (const width of [240, 420]) {
    const output = await sharp(brand).resize({ width }).webp({ quality: 86, alphaQuality: 95, effort: 6 }).toBuffer();
    await writeFile(resolve(root, `img/brand-${width}.webp`), output);
    report.push({ source: 'img/brand.webp', target: `img/brand-${width}.webp`, before: brand.length, after: output.length });
  }
  const icon = await readFile(resolve(root, 'img/logo-icon.png'));
  for (const [name, size] of [['favicon-64.png', 64], ['apple-touch-icon.png', 180]]) {
    const output = await sharp(icon).resize({ width: size, height: size }).png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 }).toBuffer();
    await writeFile(resolve(root, `img/${name}`), output);
    report.push({ source: 'img/logo-icon.png', target: `img/${name}`, before: icon.length, after: output.length });
  }
  const before = report.reduce((sum, row) => sum + row.before, 0), after = report.reduce((sum, row) => sum + row.after, 0);
  console.log(JSON.stringify({ files: report.length, before, after, sample: report.filter((_, index) => index % 12 === 0) }, null, 1));
} else {
  const env = Object.fromEntries((await readFile(resolve(root, '.env.local'), 'utf8')).split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
  if (new URL(env.SUPABASE_URL).hostname.split('.')[0] !== 'gacqqaimdfvkmznsglpg' || !env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) throw new Error('Las credenciales no corresponden al proyecto esperado.');
  const api = env.SUPABASE_URL.replace(/\/$/, '');
  const headers = { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
  const stageDir = resolve(root, 'backups/banner-variants');
  await mkdir(stageDir, { recursive: true });
  if (mode === '--banners-dry-run') {
    const banners = await (await fetch(`${api}/rest/v1/homepage_banners?select=id,desktop_image_url`, { headers })).json();
    const rows = [];
    for (const banner of banners) {
      const match = banner.desktop_image_url.match(/\/storage\/v1\/object\/public\/banner-images\/(home\/[0-9a-f-]+)\.(?:webp|jpe?g|png|avif)$/);
      if (!match) { rows.push({ id: banner.id, skipped: 'url-no-reconocida' }); continue; }
      const source = Buffer.from(await (await fetch(banner.desktop_image_url)).arrayBuffer());
      const metadata = await sharp(source).metadata();
      const output = await sharp(source).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 80, effort: 6 }).toBuffer();
      const variantPath = `${match[1]}-1280.webp`;
      await writeFile(resolve(stageDir, variantPath.replace('/', '__')), source.length ? output : Buffer.alloc(0));
      await writeFile(resolve(stageDir, `${match[1].replace('/', '__')}.source`), source);
      rows.push({ id: banner.id, source: banner.desktop_image_url, sourceBytes: source.length, sourceSha256: sha256(source), sourceWidth: metadata.width, variantPath, variantBytes: output.length, variantSha256: sha256(output) });
    }
    await writeFile(resolve(stageDir, 'stage-report.json'), JSON.stringify({ projectRef: 'gacqqaimdfvkmznsglpg', stagedAt: new Date().toISOString(), rows }, null, 2));
    console.log(JSON.stringify(rows, null, 1));
  } else {
    const stage = JSON.parse(await readFile(resolve(stageDir, 'stage-report.json'), 'utf8'));
    const results = [];
    for (const row of stage.rows.filter(item => item.variantPath)) {
      const body = await readFile(resolve(stageDir, row.variantPath.replace('/', '__')));
      if (sha256(body) !== row.variantSha256) { results.push({ path: row.variantPath, status: 'omitido-checksum-local' }); continue; }
      const current = Buffer.from(await (await fetch(row.source)).arrayBuffer());
      if (sha256(current) !== row.sourceSha256) { results.push({ path: row.variantPath, status: 'omitido-original-cambio' }); continue; }
      const url = `${api}/storage/v1/object/banner-images/${row.variantPath}`;
      const response = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'image/webp', 'cache-control': '31536000', 'x-upsert': 'false' }, body });
      const text = await response.text();
      results.push({ path: row.variantPath, status: response.ok ? 'subido' : /exists|Duplicate/i.test(text) ? 'ya-existia' : `error-${response.status}`, detail: response.ok ? undefined : text.slice(0, 200) });
    }
    await writeFile(resolve(stageDir, 'upload-report.json'), JSON.stringify({ uploadedAt: new Date().toISOString(), results }, null, 2));
    console.log(JSON.stringify(results, null, 1));
  }
}
