// Cold-visit image audit: for every <img> rendered on each route, compare the
// natural size of the downloaded resource with the size it is displayed at
// (CSS px × devicePixelRatio) and report which variant (thumb/md/lg/original/local)
// was requested. Usage: node .qa/audit-image-variants.mjs [--mobile] [--base=https://site]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Miguel/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const mobile = process.argv.includes('--mobile');
const base = (process.argv.find(arg => arg.startsWith('--base=')) || '--base=http://localhost:8080').slice(7).replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Miguel/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe', args: ['--no-sandbox'] });
const context = await browser.newContext(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  : { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
let route = 'home';
const bytesByUrl = new Map(), errors = [], failed = [];
const ignored = url => /kaspersky-labs\.com/.test(url);
page.on('console', message => { if (message.type() === 'error' && !/kaspersky/i.test(message.text())) errors.push(`${route}: ${message.text()}`); });
page.on('pageerror', error => errors.push(`${route}: ${error.message}`));
const meta = new Map();
cdp.on('Network.responseReceived', event => { if (!ignored(event.response.url)) meta.set(event.requestId, { route, url: event.response.url, status: event.response.status, type: event.response.headers['content-type'] || '' }); });
cdp.on('Network.loadingFinished', event => { const row = meta.get(event.requestId); if (row) { row.bytes = event.encodedDataLength; bytesByUrl.set(`${row.route}|${row.url}`, row); } });
cdp.on('Network.loadingFailed', event => { const row = meta.get(event.requestId); if (row && !event.canceled) failed.push({ ...row, error: event.errorText }); });

function variantOf(url) {
  if (/\/optimized\/thumb\//.test(url)) return 'thumb';
  if (/\/optimized\/md\//.test(url)) return 'md';
  if (/\/optimized\/lg\//.test(url)) return 'lg';
  if (/supabase\.co\/storage/.test(url)) return 'storage-original';
  return 'local';
}
async function scrollLazy() {
  for (let step = 0; step < 20; step += 1) {
    const done = await page.evaluate(() => { window.scrollBy(0, Math.max(550, innerHeight * 0.8)); return { after: scrollY, height: document.documentElement.scrollHeight }; });
    await page.waitForTimeout(200);
    if (done.after >= done.height - page.viewportSize().height - 5) break;
  }
  await page.waitForTimeout(2000);
}
async function collect(label) {
  return page.evaluate(label => [...document.images].filter(img => img.currentSrc && img.complete).map(img => {
    const rect = img.getBoundingClientRect();
    return { route: label, src: img.currentSrc, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, cssWidth: Math.round(rect.width), cssHeight: Math.round(rect.height), dpr: devicePixelRatio, broken: img.naturalWidth === 0, sizes: img.sizes || '', srcset: img.srcset ? img.srcset.split(',').length : 0, selector: img.id ? `#${img.id}` : (img.closest('[class]')?.className || '').toString().split(' ')[0] };
  }), label);
}
async function visit(path, label, scroll = false) {
  route = label;
  await page.goto(`${base}/${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const initial = await page.evaluate(() => [...document.images].filter(img => img.currentSrc).length);
  if (scroll) await scrollLazy();
  return { initial, images: await collect(label) };
}

const routes = {};
routes.home = await visit('index.html', 'home', true);
routes.catalog = await visit('catalogo.html', 'catalog');
const catalogInitialProductImages = await page.evaluate(() => document.querySelectorAll('.product-card img[src]').length);
const catalogCards = await page.evaluate(() => document.querySelectorAll('.product-card').length);
await scrollLazy();
const catalogAfterScrollProductImages = await page.evaluate(() => document.querySelectorAll('.product-card img[src]').length);
routes.catalog.images = await collect('catalog');
routes.detail_png = await visit('producto.html?slug=camiseta-de-nina-dri-fit', 'detail_png');
routes.detail_jpeg = await visit('producto.html?slug=arsenal-25-26-2', 'detail_jpeg');
const beforeZoom = [...bytesByUrl.values()].filter(row => row.route === 'detail_jpeg' && variantOf(row.url) === 'storage-original' && /product-images/.test(row.url)).length;
route = 'zoom';
const zoomTrigger = await page.$('[data-zoom], .product-gallery__zoom, #main-product-image');
let zoom = { triggered: false };
if (zoomTrigger) {
  await zoomTrigger.click().catch(() => {});
  await page.waitForTimeout(2500);
  const zoomRows = [...bytesByUrl.values()].filter(row => row.route === 'zoom' && /\.(?:jpe?g|png|webp)/i.test(row.url));
  zoom = { triggered: true, originalRequestsBeforeZoom: beforeZoom, zoomRequests: zoomRows.map(row => ({ url: row.url, bytes: row.bytes, variant: variantOf(row.url) })), zoomVisible: await page.evaluate(() => { const el = document.querySelector('.zoom-viewer, .image-zoom, [data-zoom-viewer], .lightbox, dialog[open]'); return Boolean(el && el.getBoundingClientRect().width > 0); }) };
}

const all = Object.values(routes).flatMap(r => r.images).map(img => {
  const row = bytesByUrl.get(`${img.route}|${img.src}`);
  const needed = Math.ceil(Math.max(img.cssWidth * img.dpr, 1));
  return { ...img, bytes: row?.bytes ?? 0, variant: variantOf(img.src), neededWidth: needed, oversize: img.naturalWidth && img.cssWidth ? +(img.naturalWidth / needed).toFixed(2) : null };
});
const top15 = [...all].sort((a, b) => b.bytes - a.bytes).slice(0, 15);
const rows = [...bytesByUrl.values()];
const sum = list => list.reduce((s, r) => s + (r.bytes || 0), 0);
const report = {
  base, viewport: mobile ? '390x844@3' : '1366x900@1',
  totals: { all: sum(rows), images: sum(rows.filter(r => r.type.startsWith('image/'))), storageImages: sum(rows.filter(r => r.type.startsWith('image/') && /supabase\.co\/storage/.test(r.url))), api: sum(rows.filter(r => /supabase\.co\/(rest|auth)\/v1/.test(r.url))), scriptsCss: sum(rows.filter(r => /javascript|css/.test(r.type))), fonts: sum(rows.filter(r => /font/.test(r.type))), html: sum(rows.filter(r => /html/.test(r.type))) },
  catalogLazy: { cards: catalogCards, imagesBeforeScroll: catalogInitialProductImages, imagesAfterScroll: catalogAfterScrollProductImages },
  zoom, broken: all.filter(img => img.broken), failed, errors,
  originalsOutsideZoom: all.filter(img => img.variant === 'storage-original' && /product-images/.test(img.src)),
  oversized: all.filter(img => img.oversize && img.oversize > 2 && img.bytes > 8000).sort((a, b) => b.bytes - a.bytes),
  top15
};
await writeFile(resolve(`.qa/image-variant-audit${mobile ? '-mobile' : ''}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, top15: top15.map(i => `${i.bytes}B ${i.route} ${i.variant} nat=${i.naturalWidth} css=${i.cssWidth}x${i.dpr} need=${i.neededWidth} x${i.oversize} ${i.selector} ${i.src.replace(/^https?:\/\/[^/]+/, '').slice(0, 90)}`), oversized: report.oversized.map(i => `${i.bytes}B ${i.route} ${i.variant} nat=${i.naturalWidth} need=${i.neededWidth} ${i.selector} ${i.src.slice(-70)}`) }, null, 1));
await browser.close();
