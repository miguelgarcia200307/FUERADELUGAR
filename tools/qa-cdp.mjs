const tabs = await fetch('http://localhost:9223/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page' && tab.url.startsWith('http://localhost:8080'));
if (!page) throw new Error('No se encontró la pestaña local para QA.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
const pending = new Map();
const runtimeErrors = [];
let failPausedRequests = false;
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    return message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails?.text || 'Runtime exception');
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') runtimeErrors.push(message.params.entry.text);
  if (message.method === 'Fetch.requestPaused' && failPausedRequests) {
    command('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'Failed' }).catch(() => {});
  }
});

function command(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const evaluate = expression => command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => result.result.value);

await command('Runtime.enable');
await command('Log.enable');
await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await command('Page.navigate', { url: 'http://localhost:8080/' });
await delay(5000);

const home = await evaluate(`(() => ({
  viewport: [innerWidth, innerHeight],
  scrollWidth: document.documentElement.scrollWidth,
  nav: [...document.querySelectorAll('.mobile-nav a span')].map(item => item.textContent),
  heroCount: document.querySelectorAll('.hero').length,
  productCount: document.querySelectorAll('#promo-products .product-card').length,
  firstProductTop: Math.round(document.querySelector('#promo-products .product-card')?.getBoundingClientRect().top || 0),
  sections: [...document.querySelectorAll('.commerce-section:not([hidden]) h1,.commerce-section:not([hidden]) h2')].map(item => item.textContent.trim())
}))()`);

const favorite = await evaluate(`(() => {
  const button = document.querySelector('#promo-products [data-favorite]');
  if (!button) return null;
  button.click();
  return { active: button.classList.contains('active'), count: document.querySelector('.favorite-badge')?.textContent };
})()`);

await evaluate(`(() => {
  const input = document.querySelector('#mobile-search');
  input.focus();
  for (const value of ['r','re','rea','real','real madrid']) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
})()`);
await delay(1500);
const search = await evaluate(`(() => ({
  query: document.querySelector('#mobile-search').value,
  open: !document.querySelector('.market-search--mobile .search-suggestions').hidden,
  text: document.querySelector('.market-search--mobile .search-suggestions').innerText,
  links: [...document.querySelectorAll('.market-search--mobile .search-suggestions a')].map(item => item.getAttribute('href'))
}))()`);

const searchTerms = {};
for (const term of ['guayos negros', 'colombia', 'balon']) {
  await evaluate(`(() => {
    const input = document.querySelector('#mobile-search');
    input.value = ${JSON.stringify(term)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await delay(900);
  searchTerms[term] = await evaluate(`document.querySelector('.market-search--mobile .search-suggestions').innerText`);
}

const viewports = [];
for (const [width, height] of [[320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await evaluate('scrollTo(0,0)');
  await delay(120);
  viewports.push(await evaluate(`(() => ({
    size: [innerWidth, innerHeight],
    scrollWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    productColumns: getComputedStyle(document.querySelector('#promo-products')).gridTemplateColumns.split(' ').length,
    firstProductTop: Math.round(document.querySelector('#promo-products .product-card').getBoundingClientRect().top),
    navVisible: getComputedStyle(document.querySelector('.mobile-nav')).display !== 'none'
  }))()`));
}

await command('Page.navigate', { url: 'http://localhost:8080/catalogo.html?q=real+madrid' });
await delay(5000);
const catalog = await evaluate(`(() => ({
  url: location.href,
  title: document.querySelector('#catalog-title')?.textContent,
  countLabel: document.querySelector('#result-count')?.textContent,
  cards: document.querySelectorAll('#catalog-products .product-card').length,
  horizontalOverflow: document.documentElement.scrollWidth > innerWidth
}))()`);

await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await command('Page.navigate', { url: 'http://localhost:8080/catalogo.html?team=real-madrid&availability=available' });
await delay(3200);
const filteredCatalog = await evaluate(`(() => {
  document.querySelector('#open-filters')?.click();
  const sheet = document.querySelector('#filters');
  const opened = sheet?.classList.contains('open');
  const title = document.querySelector('#catalog-title')?.textContent;
  const cards = document.querySelectorAll('#catalog-products .product-card').length;
  const selected = document.querySelector('input[name="team"]:checked')?.value;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return { title, cards, selected, opened, closedWithEscape: !sheet?.classList.contains('open') };
})()`);

const routes = [];
for (const route of [
  'promociones.html', 'categorias.html', 'equipos.html', 'favoritos.html', 'carrito.html',
  'equipo.html?slug=real-madrid', 'categoria.html?slug=guayos', 'producto.html?slug=balon-futbol-match-numero-5'
]) {
  await command('Page.navigate', { url: `http://localhost:8080/${route}` });
  await delay(2400);
  routes.push(await evaluate(`(() => ({
    route: location.pathname + location.search,
    title: document.title,
    appError: document.querySelector('.empty-state h1')?.textContent === 'No pudimos cargar esta página',
    overflow: document.documentElement.scrollWidth > innerWidth
  }))()`));
}

const cartFlow = await evaluate(`(() => {
  const button = document.querySelector('#add-cart');
  const before = document.querySelector('.cart-badge')?.textContent;
  if (!button || button.disabled) return { ready: false, before };
  button.click();
  return { ready: true, before };
})()`);
await delay(1600);
cartFlow.afterUrl = await evaluate('location.pathname');
cartFlow.items = await evaluate(`document.querySelectorAll('.cart-item').length`);
cartFlow.badge = await evaluate(`document.querySelector('.cart-badge')?.textContent`);

const cleanRuntimeErrors = [...runtimeErrors];
await command('Network.enable');
await command('Page.stopLoading');
await command('Fetch.enable', { patterns: [{ urlPattern: 'https://*.supabase.co/*', requestStage: 'Request' }] });
await command('Page.navigate', { url: 'http://localhost:8080/' });
await delay(2500);
const slowLoading = await evaluate(`(() => ({
  skeletons: document.querySelectorAll('.skeleton-grid:empty,.skeleton-row:empty').length,
  pageStillUsable: Boolean(document.querySelector('#site-header'))
}))()`);
await command('Page.stopLoading');
failPausedRequests = true;
await command('Page.navigate', { url: 'http://localhost:8080/' });
await delay(3500);
const failedLoading = await evaluate(`(() => ({
  title: document.querySelector('.empty-state h1')?.textContent,
  message: document.querySelector('.empty-state p')?.textContent,
  retry: document.querySelector('#retry-page')?.textContent,
  leakedTechnicalError: /postgrest|jwt|fetcherror/i.test(document.querySelector('main')?.innerText || '')
}))()`);
failPausedRequests = false;
await command('Fetch.disable');

console.log(JSON.stringify({ home, favorite, search, searchTerms, viewports, catalog, filteredCatalog, routes, cartFlow, resilience: { slowLoading, failedLoading }, runtimeErrors: cleanRuntimeErrors }, null, 2));
socket.close();
