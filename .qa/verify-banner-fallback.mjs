// Forces the 1280 px banner variant to 404 and checks the slide stays and the original loads.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Miguel/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const base = (process.argv.find(arg => arg.startsWith('--base=')) || '--base=http://localhost:8080').slice(7);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Miguel/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
const results = {};
for (const mode of ['variant-ok', 'variant-404']) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (mode === 'variant-404') await page.route(/banner-images\/home\/.*-1280\.webp/, route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const img = document.querySelector('.home-banner__slide img'); return img?.complete && img.naturalWidth > 0; }, { timeout: 20000 }).catch(() => {});
  results[mode] = await page.evaluate(() => ({ slides: document.querySelectorAll('.home-banner__slide').length, currentSrc: document.querySelector('.home-banner__slide img')?.currentSrc.split('/').pop(), naturalWidth: document.querySelector('.home-banner__slide img')?.naturalWidth }));
  results[mode].errors = errors;
  await page.close();
}
console.log(JSON.stringify(results, null, 1));
const ok = results['variant-ok'].currentSrc?.endsWith('-1280.webp') && results['variant-404'].slides === results['variant-ok'].slides && results['variant-404'].naturalWidth > 0 && !results['variant-404'].currentSrc?.includes('-1280');
await browser.close();
if (!ok) { console.error('FALLO'); process.exit(1); }
console.log('OK');
