import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Miguel/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Miguel/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
const requests = [];
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(error.message));
page.on('requestfinished', async request => {
  if (!/supabase\.co\/storage\/v1\/object\/(?:public\/)?product-images\//.test(request.url())) return;
  try { const response = await request.response(); requests.push({ url: request.url(), status: response.status(), bytes: (await response.body()).length }); }
  catch { requests.push({ url: request.url(), status: (await request.response())?.status(), bytes: null }); }
});
await page.goto('http://localhost:8080/producto.html?slug=camiseta-de-nina-dri-fit', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#main-product-image', { timeout: 30000 });
await page.waitForFunction(() => document.querySelector('#main-product-image')?.complete && document.querySelector('#main-product-image')?.naturalWidth > 0, { timeout: 30000 });
await page.screenshot({ path: resolve('.qa/product-before-zoom.png'), fullPage: false });
const before = await page.evaluate(() => ({
  src: document.querySelector('#main-product-image').currentSrc,
  srcset: document.querySelector('#main-product-image').srcset,
  thumbs: [...document.querySelectorAll('#gallery-track img')].map(image => image.currentSrc || image.dataset.src),
  zoomButtons: document.querySelectorAll('#gallery-zoom').length
}));
await page.locator('#gallery-zoom').click();
await page.waitForFunction(() => {
  const image = document.querySelector('.lightbox img');
  return image?.complete && image.naturalWidth > 0;
}, { timeout: 30000 });
const after = await page.evaluate(() => ({ src: document.querySelector('.lightbox img').currentSrc, alt: document.querySelector('.lightbox img').alt }));
await page.screenshot({ path: resolve('.qa/product-zoom-open.png'), fullPage: false });
const report = { before, after, originalOnlyLoadedAfterActivation: !before.src.includes('/product-images/') && after.src.includes('/product-images/') || after.src.includes('aa086d94-8de0-434c-acdf-83dbc29f790c.png'), requestCount: requests.length, originalRequests: requests.filter(item => item.url.includes('aa086d94-8de0-434c-acdf-83dbc29f790c.png')), errors };
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!before.src.includes('/optimized/md/') && !before.src.includes('/optimized/lg/')) process.exitCode = 1;
if (!after.src.includes('aa086d94-8de0-434c-acdf-83dbc29f790c.png')) process.exitCode = 1;
if (errors.length) process.exitCode = 1;
