import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tabs = await fetch('http://localhost:9224/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page');
if (!page) throw new Error('No se encontró una pestaña para QA de equipos.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
const pending = new Map();
const runtimeErrors = [];
const apiRequests = [];
const failedRequests = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    return message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails?.text || 'Runtime exception');
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') runtimeErrors.push(message.params.entry.text);
  if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('supabase.co/rest/v1/')) apiRequests.push(message.params.request.url);
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) failedRequests.push({ status: message.params.response.status, url: message.params.response.url });
});

function command(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const evaluate = expression => command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => {
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
});

async function waitFor(expression, timeout = 7000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await delay(120);
  }
  throw new Error(`Tiempo agotado esperando: ${expression}`);
}

await command('Runtime.enable');
await command('Log.enable');
await command('Network.enable');

const viewports = [];
for (const [width, height] of [[320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await command('Page.navigate', { url: 'http://localhost:8080/equipos.html' });
  await waitFor(`document.querySelector('#all-teams')?.getAttribute('aria-busy') === 'false'`);
  const state = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.team-card--directory')];
    const chips = [...document.querySelectorAll('#team-tabs .tab')];
    const grid = document.querySelector('#all-teams');
    return {
      size: [innerWidth, innerHeight],
      overflow: document.documentElement.scrollWidth > innerWidth,
      columns: cards.length ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      cards: cards.length,
      visibleCards: cards.filter(card => { const rect = card.getBoundingClientRect(); return rect.top < innerHeight && rect.bottom > 0; }).length,
      firstCardTop: Math.round(cards[0]?.getBoundingClientRect().top || 0),
      chipLabels: chips.map(chip => chip.textContent.trim()),
      clippedChips: chips.filter(chip => chip.scrollWidth > chip.clientWidth + 1).map(chip => chip.textContent.trim()),
      crestFits: cards.every(card => { const image = card.querySelector('.team-crest img'); return !image || getComputedStyle(image).objectFit === 'contain'; }),
      equalFirstRow: cards.length < 2 || Math.abs(cards[0].getBoundingClientRect().height - cards[1].getBoundingClientRect().height) < 1,
      navVisible: getComputedStyle(document.querySelector('.mobile-nav')).display !== 'none'
    };
  })()`);
  viewports.push(state);

  if (width === 390 || width === 1440) {
    const capture = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const path = join(tmpdir(), `fuera-de-lugar-equipos-${width}.png`);
    await writeFile(path, Buffer.from(capture.data, 'base64'));
  }
}

await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await command('Page.navigate', { url: 'http://localhost:8080/equipos.html' });
await waitFor(`document.querySelector('#all-teams')?.getAttribute('aria-busy') === 'false'`);

async function search(value) {
  await evaluate(`(() => {
    const input = document.querySelector('#team-search-input');
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await delay(300);
  return evaluate(`(() => ({
    names: [...document.querySelectorAll('.team-card--directory strong')].map(item => item.textContent.trim()),
    count: document.querySelector('#team-result-count').textContent,
    empty: document.querySelector('.team-empty h2')?.textContent || '',
    url: location.search,
    clearVisible: !document.querySelector('#clear-team-search').hidden
  }))()`);
}

const searchReal = await search('  REAL  ');
await evaluate(`document.querySelector('#clear-team-search').click()`);
await delay(80);
const filterResults = {};
for (const type of ['all', 'club', 'national_team', 'colombian_team']) {
  await evaluate(`document.querySelector('[data-type="${type}"]').click()`);
  await delay(60);
  filterResults[type] = await evaluate(`(() => ({
    names: [...document.querySelectorAll('.team-card--directory strong')].map(item => item.textContent.trim()),
    pressed: document.querySelector('[data-type="${type}"]').getAttribute('aria-pressed'),
    url: location.search
  }))()`);
}
await evaluate(`document.querySelector('[data-type="national_team"]').click()`);
await delay(60);
const searchColombia = await search('colombia');
const noResults = await search('xyzabc');
await evaluate(`document.querySelector('#clear-team-filters').click()`);
await delay(80);
const resetState = await evaluate(`(() => ({
  search: document.querySelector('#team-search-input').value,
  active: document.querySelector('#team-tabs .active').dataset.type,
  sort: document.querySelector('#team-sort-select').value,
  url: location.search
}))()`);

await evaluate(`(() => {
  const select = document.querySelector('#team-sort-select');
  select.value = 'desc';
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
const descending = await evaluate(`[...document.querySelectorAll('.team-card--directory strong')].map(item => item.textContent.trim())`);
await evaluate(`document.querySelector('#clear-team-filters').click()`);
const runtimeErrorsBeforeFallback = [...runtimeErrors];

const fallback = await evaluate(`(async () => {
  const image = document.querySelector('.team-card--directory [data-team-crest-image]');
  if (!image) return { tested: false };
  image.src = 'http://localhost:8080/assets/images/teams/__missing__.png';
  await new Promise(resolve => setTimeout(resolve, 250));
  const crest = document.querySelector('.team-card--directory .team-crest');
  return { tested: true, fallback: crest.classList.contains('team-crest--fallback'), hasImage: Boolean(crest.querySelector('img')), text: crest.textContent.trim() };
})()`);

const cardLinks = await evaluate(`[...document.querySelectorAll('.team-card--directory')].map(card => ({ label: card.getAttribute('aria-label'), href: card.getAttribute('href') }))`);

await command('Page.navigate', { url: 'http://localhost:8080/equipo.html?slug=real-madrid' });
await waitFor(`document.querySelector('#listing-title')?.textContent === 'Real Madrid' && !document.querySelector('#listing-products')?.classList.contains('skeleton-grid')`);
const teamListing = await evaluate(`(() => ({
  title: document.querySelector('#listing-title')?.textContent,
  products: document.querySelectorAll('#listing-products .product-card').length,
  breadcrumbs: document.querySelector('#breadcrumbs')?.textContent.replace(/\\s+/g, ' ').trim(),
  overflow: document.documentElement.scrollWidth > innerWidth
}))()`);

const report = {
  viewports,
  behavior: { searchReal, filterResults, searchColombia, noResults, resetState, descending, fallback, cardLinks, teamListing },
  apiRequestCount: apiRequests.length,
  apiRoutes: [...new Set(apiRequests.map(url => new URL(url).pathname))],
  runtimeErrorsBeforeFallback,
  expectedFallbackRequestErrors: runtimeErrors.slice(runtimeErrorsBeforeFallback.length),
  failedRequests,
  screenshots: [join(tmpdir(), 'fuera-de-lugar-equipos-390.png'), join(tmpdir(), 'fuera-de-lugar-equipos-1440.png')]
};

console.log(JSON.stringify(report, null, 2));
socket.close();
