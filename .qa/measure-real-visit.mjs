import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Miguel/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Miguel/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
let route = 'home';
const entries = new Map(), errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(`${route}: ${message.text()}`); });
page.on('pageerror', error => errors.push(`${route}: ${error.message}`));
cdp.on('Network.responseReceived', event => entries.set(event.requestId, {
  route, url: event.response.url, type: event.type, status: event.response.status,
  contentType: event.response.headers['content-type'] || '', contentLength: Number(event.response.headers['content-length'] || 0),
  cache: event.response.headers['cf-cache-status'] || null, fromDiskCache: event.response.fromDiskCache || false, fromServiceWorker: event.response.fromServiceWorker || false
}));
cdp.on('Network.loadingFinished', event => { const row = entries.get(event.requestId); if (row) row.encodedBytes = event.encodedDataLength; });

async function settle() { await page.waitForTimeout(2200); }
async function scrollLazy() {
  for (let step = 0; step < 16; step += 1) {
    const done = await page.evaluate(() => { const before = scrollY; window.scrollBy(0, Math.max(550, innerHeight * 0.8)); return { before, after: scrollY, height: document.documentElement.scrollHeight }; });
    await page.waitForTimeout(180);
    if (done.after >= done.height - page.viewportSize().height - 5) break;
  }
  await settle();
}
async function visit(path, label, scroll = false) {
  route = label;
  await page.goto(`http://localhost:8080/${path}`, { waitUntil: 'domcontentloaded' });
  await settle();
  if (scroll) await scrollLazy();
}

await visit('index.html', 'home', true);
const homeCards = await page.locator('.product-card').count();
await visit('catalogo.html', 'catalog', true);
const catalogCards = await page.locator('.product-card').count();
await visit('producto.html?slug=camiseta-de-nina-dri-fit', 'detail_png');
await page.waitForFunction(() => { const image = document.querySelector('#main-product-image'); return image?.complete && image.naturalWidth > 0; }, { timeout: 30000 }).catch(() => {});
await visit('producto.html?slug=arsenal-25-26-2', 'detail_jpeg');
await page.waitForFunction(() => { const image = document.querySelector('#main-product-image'); return image?.complete && image.naturalWidth > 0; }, { timeout: 30000 }).catch(() => {});

const rows = [...entries.values()].filter(item => Number.isFinite(item.encodedBytes));
const imageRows = rows.filter(item => item.contentType.startsWith('image/'));
const apiRows = rows.filter(item => /\.supabase\.co\/(?:rest\/v1|auth\/v1|graphql\/v1|functions\/v1)/.test(item.url));
const sumBytes = items => items.reduce((sum, item) => sum + (item.encodedBytes || 0), 0);
const imageBytes = sumBytes(imageRows);
const apiBytes = sumBytes(apiRows);
const cachedImageBytes = sumBytes(imageRows.filter(item => String(item.cache).toUpperCase() === 'HIT'));
const uncachedImageBytes = imageBytes - cachedImageBytes;
const noncachedEgressBytes = uncachedImageBytes + apiBytes;
const cached = imageRows.filter(item => ['HIT', 'MISS', 'STALE', 'REVALIDATED', 'BYPASS'].includes(String(item.cache).toUpperCase()));
const report = {
  measuredAt: new Date().toISOString(),
  routePlan: ['home (scroll lazy content)', 'catalog (first page, scroll lazy content)', 'product detail with PNG', 'product detail with JPEG'],
  loadedCards: { home: homeCards, catalog: catalogCards },
  imageRequests: imageRows.length, distinctImageUrlsPerRoute: new Set(imageRows.map(item => `${item.route}:${item.url}`)).size,
  imageEncodedBytes: imageBytes, apiRequests: apiRows.length, apiEncodedBytes: apiBytes,
  cachedImageBytes, uncachedImageBytes, noncachedEgressBytes,
  combinedEncodedBytes: imageBytes + apiBytes,
  egressPer1000ImagesBytes: imageBytes * 1000, egressPer1000ApiBytes: apiBytes * 1000,
  egressPer1000CachedBytes: cachedImageBytes * 1000, egressPer1000NoncachedBytes: noncachedEgressBytes * 1000,
  visitsIn5GbImages: imageBytes ? Math.floor(5_000_000_000 / imageBytes) : null,
  visitsIn5GbApi: apiBytes ? Math.floor(5_000_000_000 / apiBytes) : null,
  visitsIn5GbCachedQuota: cachedImageBytes ? Math.floor(5_000_000_000 / cachedImageBytes) : null,
  visitsIn5GbNoncachedQuota: noncachedEgressBytes ? Math.floor(5_000_000_000 / noncachedEgressBytes) : null,
  cfCacheStatusHeaderPresent: cached.length > 0, cfCacheStatuses: Object.fromEntries([...new Set(imageRows.map(item => item.cache || 'unavailable'))].map(status => [status, imageRows.filter(item => (item.cache || 'unavailable') === status).length])),
  errors,
  requests: rows
};
await writeFile(resolve('.qa/real-visit-measurement.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, requests: undefined }, null, 2));
await browser.close();
