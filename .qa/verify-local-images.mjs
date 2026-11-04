import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Miguel/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Miguel/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
let route = '';
const errors = [];
page.on('response', response => { if (response.request().resourceType() === 'image' && response.status() >= 400) errors.push({ route, status: response.status(), url: response.url() }); });
page.on('console', message => { if (message.type() === 'error') errors.push({ route, console: message.text() }); });
page.on('pageerror', error => errors.push({ route, runtime: error.message }));
const routes = [
  ['index.html', 'home', true], ['catalogo.html', 'catalog', true], ['categorias.html', 'categories', true],
  ['equipos.html', 'teams', true], ['promociones.html', 'promotions', true], ['equipo.html?slug=real-madrid', 'team-detail', true],
  ['categoria.html?slug=guayos', 'category-detail', true], ['producto.html?slug=arsenal-25-26-2', 'product-detail', false],
  ['producto.html?slug=camiseta-de-nina-dri-fit', 'product-png', false], ['carrito.html', 'cart', false], ['checkout.html', 'checkout', false]
];
const results = [];
try {
  for (const [path, label, scroll] of routes) {
    route = label;
    await page.goto(`http://localhost:8080/${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    if (scroll) {
      for (let step = 0; step < 10; step += 1) {
        const y = await page.evaluate(() => { window.scrollBy(0, innerHeight * 0.8); return scrollY; });
        await page.waitForTimeout(220);
        if (y >= await page.evaluate(() => document.documentElement.scrollHeight - innerHeight - 5)) break;
      }
      await page.waitForTimeout(500);
    }
    const images = await page.locator('img').evaluateAll(items => items.filter(image => image.currentSrc).map(image => ({
      src: image.currentSrc, loaded: image.complete && image.naturalWidth > 0, width: image.naturalWidth
    })));
    results.push({ route: label, loaded: images.filter(image => image.loaded).length, broken: images.filter(image => !image.loaded).map(image => image.src) });
    errors.push(...images.filter(image => !image.loaded).map(image => ({ route: label, broken: image.src })));
  }
  console.log(JSON.stringify({ routes: results, errors }, null, 2));
  assert.deepEqual(errors, [], 'Todas las imágenes solicitadas deben cargar sin errores.');
} finally { await browser.close(); }
