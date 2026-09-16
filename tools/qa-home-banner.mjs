import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validBannerInterval, safeBannerLink, BANNER_LIMIT } from '../js/lib/home-banner.js';

for (const value of [0.5, 1.5, 2.5, 5, 60]) assert.equal(validBannerInterval(value), true, `intervalo ${value}`);
for (const value of [-1, 0, 60.1, 'texto', '', NaN, 2.55]) assert.equal(validBannerInterval(value), false, `intervalo inválido ${value}`);
assert.equal(BANNER_LIMIT, 5);
assert.equal(safeBannerLink('promociones.html'), 'promociones.html');
assert.equal(safeBannerLink('/categorias.html'), '/categorias.html');
assert.equal(safeBannerLink('https://ejemplo.com/promocion'), 'https://ejemplo.com/promocion');
assert.equal(safeBannerLink(''), '');
assert.equal(safeBannerLink(null), '');
assert.deepEqual(
  [{ link_url: null }, { link_url: '' }].map(row => safeBannerLink(row.link_url) || null),
  [null, null],
  'dos banners con enlaces vacíos deben conservar un valor opcional válido'
);
for (const url of ['javascript:alert(1)', 'data:text/html,abc', '//evil.example', 'ftp://ejemplo.com']) {
  assert.equal(safeBannerLink(url), '', `URL insegura ${url}`);
}

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260916004822_home_banner.sql', import.meta.url), 'utf8');
const css = await readFile(new URL('../assets/css/styles.css', import.meta.url), 'utf8');
const publicJs = await readFile(new URL('../js/pages/public.js', import.meta.url), 'utf8');
const editor = await readFile(new URL('../js/components/banner-editor.js', import.meta.url), 'utf8');
assert.ok(html.indexOf('class="quick-shop') < html.indexOf('id="home-banner-section"'));
assert.ok(html.indexOf('id="home-banner-section"') < html.indexOf('id="home-promotions"'));
assert.ok(html.indexOf('id="home-banner-section"') > html.indexOf('id="home-discovery"'));
assert.match(css, /aspect-ratio:\s*1\.8/);
assert.match(css, /aspect-ratio:\s*3/);
assert.match(css, /prefers-reduced-motion/);
assert.match(publicJs, /settings\.banner_enabled/);
assert.match(migration, /banner_enabled boolean not null default false/);
assert.match(migration, /check \(banner_interval_seconds between 0\.5 and 60\)/);
assert.match(migration, /homepage_banner_limit/);
assert.match(migration, /jsonb_array_length\(new_banners\) > 5/);
assert.match(migration, /public\.is_admin\(\)/);
assert.match(migration, /bucket_id = 'banner-images'/);
assert.match(editor, /getHomepageBanners\(\{ all: true \}\)/);
assert.match(editor, /Promise\.allSettled\(uploaded\.map\(removeBannerImage\)\)/);
for (const required of [
  'banner-studio__hero', 'banner-switch', 'banner-quick', 'banner-guide__grid',
  'banner-slide-card', 'banner-dropzone', 'banner-device-frame', 'banner-savebar',
  'data-action="toggle"', 'data-action="remove-image"', 'data-dropzone',
  'Cambios sin guardar', 'Guardar cambios del banner'
]) assert.ok(editor.includes(required), `interfaz rediseñada: ${required}`);
assert.match(editor, /dragenter.*dragover.*dragleave.*drop/);
assert.match(editor, /aria-expanded=/);
assert.match(css + await readFile(new URL('../assets/css/admin.css', import.meta.url), 'utf8'), /@media \(min-width:1180px\)/);
console.log('QA banner: intervalos, URLs, ubicación, responsive, límite, seguridad y persistencia estructural OK');
