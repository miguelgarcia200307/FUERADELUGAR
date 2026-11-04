import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Miguel/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Miguel/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const imageRequests = [];
page.on('request', request => { if (request.resourceType() === 'image') imageRequests.push(request.url()); });
page.on('pageerror', error => { throw error; });

try {
  await page.goto('http://localhost:8080/catalogo.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.product-card img');
  await page.waitForTimeout(1800);
  const initial = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.product-card img')];
    return { total: cards.length, requested: cards.filter(image => image.hasAttribute('src')).length,
      maxCardTop: Math.round(Math.max(...cards.map(image => image.closest('.product-card').getBoundingClientRect().top))), viewportHeight: innerHeight,
      requestedBeyondNextViewport: cards.filter(image => image.hasAttribute('src') && image.getBoundingClientRect().top > innerHeight + 500).length,
      sourceKinds: cards.filter(image => image.hasAttribute('src')).map(image => image.getAttribute('src')) };
  });
  assert.ok(initial.total > 0, 'El catálogo debe mostrar productos.');
  assert.ok(initial.requested > 0 && initial.requested < initial.total, 'La primera carga debe limitar imágenes a las cercanas a la pantalla.');
  assert.equal(initial.requestedBeyondNextViewport, 0, 'No debe pedir imágenes más allá del siguiente viewport.');
  await page.evaluate(() => window.scrollBy(0, innerHeight * 0.75));
  await page.waitForTimeout(1200);
  const afterScroll = await page.evaluate(() => [...document.querySelectorAll('.product-card img')].filter(image => image.hasAttribute('src')).length);
  assert.ok(afterScroll > initial.requested, 'Al desplazarse deben activarse las imágenes siguientes.');
  const wrongProductVariants = imageRequests.filter(url => /\/storage\/v1\/object\/public\/product-images\//.test(url)
    && !/\/optimized\/thumb\//.test(url));
  assert.deepEqual(wrongProductVariants, [], 'El catálogo solo debe pedir variantes thumb de Storage.');
  console.log(JSON.stringify({ initial: { total: initial.total, requested: initial.requested, requestedBeyondNextViewport: initial.requestedBeyondNextViewport }, afterScroll, imageRequests: imageRequests.length, nonThumbProductRequests: wrongProductVariants.length }, null, 2));
} finally { await browser.close(); }
