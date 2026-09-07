import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tabs = await fetch('http://127.0.0.1:9224/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page');
if (!page) throw new Error('No se encontró una pestaña para QA de la colección de equipo.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
const pending = new Map();
const runtimeErrors = [];
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

async function waitFor(expression, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await delay(120);
  }
  throw new Error(`Tiempo agotado esperando: ${expression}`);
}

async function navigate(url) {
  await command('Page.navigate', { url });
  await waitFor(`document.querySelector('#team-collection-header')?.getAttribute('aria-busy') === 'false' && document.querySelector('#listing-products')?.getAttribute('aria-busy') === 'false'`);
}

await command('Runtime.enable');
await command('Log.enable');
await command('Network.enable');
await command('Page.enable');

const viewports = [];
for (const [width, height] of [[320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await navigate('http://localhost:8080/equipo.html?slug=real-madrid');
  viewports.push(await evaluate(`(() => {
    const grid = document.querySelector('#listing-products');
    const cards = [...grid.querySelectorAll('.product-card')];
    const toolbar = document.querySelector('.team-catalog-toolbar');
    const crest = document.querySelector('#team-crest img');
    return {
      size: [innerWidth, innerHeight],
      overflow: document.documentElement.scrollWidth > innerWidth,
      columns: cards.length ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      products: cards.length,
      firstCardTop: Math.round(cards[0]?.getBoundingClientRect().top || 0),
      firstCardVisible: Boolean(cards[0] && cards[0].getBoundingClientRect().top < innerHeight),
      toolbarFits: toolbar.scrollWidth <= toolbar.clientWidth + 1,
      headerHeight: Math.round(document.querySelector('#team-collection-header').getBoundingClientRect().height),
      crestObjectFit: crest ? getComputedStyle(crest).objectFit : 'fallback',
      navVisible: getComputedStyle(document.querySelector('.mobile-nav')).display !== 'none'
    };
  })()`));
  if (width === 390 || width === 1440) {
    const capture = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(tmpdir(), `fuera-de-lugar-equipo-${width}.png`), Buffer.from(capture.data, 'base64'));
  }
}

await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await navigate('http://localhost:8080/equipo.html?slug=real-madrid');

const initial = await evaluate(`(async () => {
  const ids = [...document.querySelectorAll('.product-card')].map(card => card.dataset.productId);
  const { getProductsByIds } = await import('/js/lib/api.js');
  const products = await getProductsByIds(ids);
  return {
    title: document.title,
    heading: document.querySelector('#listing-title').textContent,
    meta: document.querySelector('#team-meta').textContent,
    description: document.querySelector('meta[name="description"]').content,
    breadcrumb: document.querySelector('#breadcrumbs').textContent.replace(/\s+/g, ' ').trim(),
    count: document.querySelector('#team-result-count').textContent,
    filterLabels: [...document.querySelectorAll('#team-filters .filter-section__toggle > span:first-child')].map(item => item.textContent),
    allProductsFromTeam: products.every(product => product.teams?.slug === 'real-madrid'),
    teamLabelHiddenInCards: [...document.querySelectorAll('.product-card__meta')].every(meta => meta.textContent.trim() !== 'Real Madrid'),
    productLinks: [...document.querySelectorAll('.product-card h3 a')].map(link => link.getAttribute('href')),
    favoriteButtons: document.querySelectorAll('[data-favorite]').length
  };
})()`);

const longName = await evaluate(`(() => {
  const heading = document.querySelector('#listing-title');
  const original = heading.textContent;
  heading.textContent = 'Selección de Estados Unidos';
  const header = document.querySelector('#team-collection-header');
  const result = { overflow: header.scrollWidth > header.clientWidth + 1, height: Math.round(header.getBoundingClientRect().height) };
  heading.textContent = original;
  return result;
})()`);

await evaluate(`document.querySelector('#open-team-filters').click()`);
await waitFor(`document.querySelector('#team-filters').classList.contains('open')`);
const openFilterState = await evaluate(`(() => ({
  expanded: document.querySelector('#open-team-filters').getAttribute('aria-expanded'),
  teamSectionPresent: [...document.querySelectorAll('#team-filters .filter-section__toggle')].some(button => button.textContent.trim() === 'Equipo'),
  touchTargets: [...document.querySelectorAll('.team-tool-button,.team-sort-control')].every(control => control.getBoundingClientRect().height >= 44)
}))()`);

const filterCandidate = await evaluate(`(async () => {
  const { getEntityBySlug, getProducts } = await import('/js/lib/api.js');
  const team = await getEntityBySlug('team', 'real-madrid');
  const result = await getProducts({ teamId: team.id, pageSize: 20 });
  const product = result.products[0];
  return {
    size: product?.product_sizes?.[0]?.name || '',
    color: product?.product_colors?.[0]?.name || '',
    category: product?.product_categories?.[0]?.categories?.slug || ''
  };
})()`);

const chosenFilters = Object.entries(filterCandidate).filter(([, value]) => value).slice(0, 3);
await evaluate(`(() => {
  const chosen = ${JSON.stringify(chosenFilters)};
  for (const [name, value] of chosen) {
    const input = [...document.querySelectorAll('#team-filters input[name="' + name + '"]')].find(item => item.value === value);
    if (input) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  document.querySelector('#team-filters .filter-submit').click();
})()`);
await waitFor(`!document.querySelector('#team-filters').classList.contains('open') && document.querySelector('#listing-products').getAttribute('aria-busy') === 'false'`);
const filtered = await evaluate(`(async () => {
  const ids = [...document.querySelectorAll('.product-card')].map(card => card.dataset.productId);
  const { getProductsByIds } = await import('/js/lib/api.js');
  const products = await getProductsByIds(ids);
  return {
    count: document.querySelector('#team-result-count').textContent,
    buttonCount: document.querySelector('#team-filter-count').textContent,
    chips: [...document.querySelectorAll('#team-active-filters [data-remove-filter]')].map(chip => chip.textContent.replace('×', '').trim()),
    url: location.search,
    products: ids.length,
    allProductsFromTeam: products.every(product => product.teams?.slug === 'real-madrid')
  };
})()`);

const firstChip = await evaluate(`document.querySelector('#team-active-filters [data-remove-filter]')?.getAttribute('data-remove-filter') || ''`);
if (firstChip) {
  await evaluate(`document.querySelector('#team-active-filters [data-remove-filter]').click()`);
  await waitFor(`document.querySelector('#listing-products').getAttribute('aria-busy') === 'false'`);
}
const afterChipRemoval = await evaluate(`(() => ({ count: document.querySelector('#team-filter-count').textContent, url: location.search }))()`);

await evaluate(`document.querySelector('#team-active-filters .active-filter-clear')?.click()`);
await waitFor(`document.querySelector('#listing-products').getAttribute('aria-busy') === 'false'`);
await evaluate(`(() => { const select = document.querySelector('#team-sort-select'); select.value = 'price-asc'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await waitFor(`document.querySelector('#listing-products').getAttribute('aria-busy') === 'false'`);
const priceSort = await evaluate(`(() => {
  const values = [...document.querySelectorAll('.product-card .price strong')].map(item => Number(item.textContent.replace(/[^0-9]/g, '')));
  return { values, ascending: values.every((value, index) => index === 0 || values[index - 1] <= value), url: location.search };
})()`);

await evaluate(`(() => { const select = document.querySelector('#team-sort-select'); select.value = 'discount'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await waitFor(`document.querySelector('#listing-products').getAttribute('aria-busy') === 'false'`);
const discountSort = await evaluate(`(() => {
  const values = [...document.querySelectorAll('.product-card .status-badge--sale')].map(item => Number(item.textContent.replace(/[^0-9]/g, '')));
  return { values, descending: values.every((value, index) => index === 0 || values[index - 1] >= value), url: location.search };
})()`);

await evaluate(`document.querySelector('#open-team-filters').click()`);
await waitFor(`document.querySelector('#team-filters').classList.contains('open')`);
await evaluate(`(() => { const input = document.querySelector('#team-filters input[name="maxPrice"]'); input.value = '1'; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#team-filters .filter-submit').click(); })()`);
await waitFor(`!document.querySelector('#team-filters').classList.contains('open') && document.querySelector('#listing-products').getAttribute('aria-busy') === 'false'`);
const filteredEmpty = await evaluate(`(() => ({ heading: document.querySelector('.team-filter-empty h2')?.textContent || '', clearButton: document.querySelector('#empty-clear-team-filters')?.textContent || '', url: location.search }))()`);
await evaluate(`document.querySelector('#empty-clear-team-filters').click()`);
await waitFor(`document.querySelector('#listing-products .product-card')`);

await evaluate(`Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => { window.__sharedPayload = payload; } }); document.querySelector('#share-listing').click()`);
await waitFor(`Boolean(window.__sharedPayload)`);
const share = await evaluate(`window.__sharedPayload`);

const fallback = await evaluate(`(async () => {
  const image = document.querySelector('#team-crest img');
  if (!image) return { tested: false };
  image.src = '/assets/images/teams/__missing-team-listing__.png';
  await new Promise(resolve => setTimeout(resolve, 250));
  const crest = document.querySelector('#team-crest');
  return { tested: true, fallback: crest.classList.contains('team-crest--fallback'), hasImage: Boolean(crest.querySelector('img')), initials: crest.textContent.trim() };
})()`);

await command('Page.navigate', { url: 'http://localhost:8080/equipo.html?slug=equipo-inexistente' });
await waitFor(`document.querySelector('.team-not-found h1')?.textContent === 'Equipo no encontrado'`);
const notFound = await evaluate(`(() => ({ title: document.title, heading: document.querySelector('.team-not-found h1').textContent, actions: [...document.querySelectorAll('.team-not-found a')].map(link => link.textContent.trim()) }))()`);

console.log(JSON.stringify({ viewports, initial, longName, openFilterState, filterCandidate, filtered, afterChipRemoval, priceSort, discountSort, filteredEmpty, share, fallback, notFound, runtimeErrors, failedRequests, screenshots: [join(tmpdir(), 'fuera-de-lugar-equipo-390.png'), join(tmpdir(), 'fuera-de-lugar-equipo-1440.png')] }, null, 2));
socket.close();
