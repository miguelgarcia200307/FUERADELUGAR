const base = 'http://localhost:8082/';
const tabs = await fetch('http://localhost:9224/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page');
if (!page) throw new Error('No browser page');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let id = 0;
const pending = new Map();
const runtimeErrors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    return message.error ? handlers.reject(new Error(message.error.message)) : handlers.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') runtimeErrors.push(message.params.entry.text);
});
function command(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = expression => command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => result.result.value);
async function navigate(path, delay = 3500) {
  await command('Page.navigate', { url: base + path });
  await wait(delay);
}
await command('Runtime.enable');
await command('Log.enable');
await command('Page.enable');
await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

await navigate('categorias.html', 4500);
const categories = await evaluate(`(() => ({
  title: document.querySelector('.compact-page-header h1')?.textContent,
  description: document.querySelector('.compact-page-header p')?.textContent,
  cards: document.querySelectorAll('.category-card').length,
  columns: getComputedStyle(document.querySelector('.category-directory')).gridTemplateColumns.split(' ').length,
  visibleCards: [...document.querySelectorAll('.category-card')].filter(card => card.getBoundingClientRect().top < innerHeight).length,
  firstTop: Math.round(document.querySelector('.category-card')?.getBoundingClientRect().top || 0),
  fallbacks: document.querySelectorAll('.category-card__fallback').length,
  names: [...document.querySelectorAll('.category-card strong')].map(node => node.textContent.trim()),
  links: [...document.querySelectorAll('.category-card')].map(node => node.getAttribute('href')),
  searchVisible: document.querySelector('#mobile-search')?.getBoundingClientRect().height > 0,
  activeNav: document.querySelector('.mobile-nav a.active span')?.textContent,
  overflow: document.documentElement.scrollWidth > innerWidth
}))()`);

const uniformLink = categories.links.find((link, index) => /uniforme.*adult/i.test(categories.names[index])) || categories.links[0];
await navigate(uniformLink, 4300);
const categoryDetailBefore = await evaluate(`(() => ({
  title: document.querySelector('#listing-title')?.textContent,
  filters: [...document.querySelectorAll('.category-filter')].map(node => node.textContent.trim()),
  products: document.querySelectorAll('#listing-products .product-card').length,
  overflow: document.documentElement.scrollWidth > innerWidth
}))()`);
await evaluate(`document.querySelectorAll('.category-filter')[1]?.click()`);
await wait(700);
const categoryDetailAfter = await evaluate(`(() => ({
  url: location.pathname + location.search,
  active: document.querySelector('.category-filter.active')?.textContent.trim(),
  products: document.querySelectorAll('#listing-products .product-card').length,
  teams: document.querySelectorAll('#category-teams .team-card').length,
  empty: document.querySelector('#listing-products .empty-state h2')?.textContent
}))()`);

const accessoriesLink = categories.links.find((link, index) => /accesor/i.test(categories.names[index]));
let accessories = null;
if (accessoriesLink) {
  await navigate(accessoriesLink, 4300);
  accessories = await evaluate(`(() => ({
    filters: document.querySelectorAll('.category-filter').length,
    grid: Boolean(document.querySelector('.subcategory-grid')),
    columns: document.querySelector('.subcategory-grid') ? getComputedStyle(document.querySelector('.subcategory-grid')).gridTemplateColumns.split(' ').length : 0,
    products: document.querySelectorAll('#listing-products .product-card').length,
    overflow: document.documentElement.scrollWidth > innerWidth
  }))()`);
}

await navigate('producto.html?slug=balon-futbol-match-numero-5', 4300);
const productReady = await evaluate(`(() => ({ button: Boolean(document.querySelector('#add-cart')), disabled: document.querySelector('#add-cart')?.disabled }))()`);
if (productReady.button && !productReady.disabled) {
  await evaluate(`document.querySelector('#add-cart').click()`);
  await wait(1800);
} else {
  await navigate('carrito.html', 3500);
}
const cartBefore = await evaluate(`(() => ({
  path: location.pathname,
  items: document.querySelectorAll('.cart-item').length,
  count: document.querySelector('#cart-count-label')?.textContent,
  imageWidth: Math.round(document.querySelector('.cart-item__image')?.getBoundingClientRect().width || 0),
  quantity: document.querySelector('.cart-item .quantity input')?.value,
  total: document.querySelector('.summary-line--total strong')?.textContent,
  sticky: getComputedStyle(document.querySelector('#cart-sticky-checkout')).display,
  whatsapp: getComputedStyle(document.querySelector('.whatsapp-float')).display,
  overflow: document.documentElement.scrollWidth > innerWidth
}))()`);
await evaluate(`document.querySelector('.cart-item [data-action="plus"]:not(:disabled)')?.click()`);
await wait(450);
const cartAfterQuantity = await evaluate(`(() => ({ quantity: document.querySelector('.cart-item .quantity input')?.value, total: document.querySelector('.summary-line--total strong')?.textContent }))()`);
await evaluate(`document.querySelector('.cart-item [data-action="edit"]')?.click()`);
await wait(300);
const editor = await evaluate(`(() => ({ open: Boolean(document.querySelector('.variant-editor')), colors: document.querySelectorAll('[data-color]').length, sizes: document.querySelectorAll('[data-size]').length, save: Boolean(document.querySelector('[data-save-variant]')) }))()`);
const editorUpdate = await evaluate(`(() => {
  const oldImage = document.querySelector('.cart-item__image')?.src;
  const colors = document.querySelectorAll('.variant-editor [data-color]');
  if (colors.length > 1) colors[1].click();
  document.querySelector('.variant-editor [data-save-variant]')?.click();
  return { oldImage };
})()`);
await wait(400);
editorUpdate.modalClosed = await evaluate(`!document.querySelector('.variant-editor')`);
editorUpdate.variant = await evaluate(`document.querySelector('.cart-item__variants')?.innerText`);
editorUpdate.imageChanged = await evaluate(`document.querySelector('.cart-item__image')?.src !== ${JSON.stringify(editorUpdate.oldImage)}`);
await command('Page.reload');
await wait(3600);
const persistence = await evaluate(`(() => ({ items: document.querySelectorAll('.cart-item').length, quantity: document.querySelector('.cart-item .quantity input')?.value }))()`);
const stockLimit = await evaluate(`(() => {
  const input = document.querySelector('.cart-item .quantity input');
  if (!input) return null;
  const max = Number(input.max);
  input.value = String(max + 3);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { max };
})()`);
await wait(350);
if (stockLimit) {
  stockLimit.value = await evaluate(`document.querySelector('.cart-item .quantity input')?.value`);
  stockLimit.plusDisabled = await evaluate(`document.querySelector('.cart-item [data-action="plus"]')?.disabled`);
}

const responsive = [];
for (const [width, height] of [[320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await navigate('categorias.html', 550);
  const categoryMetrics = await evaluate(`(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, columns: getComputedStyle(document.querySelector('.category-directory')).gridTemplateColumns.split(' ').length }))()`);
  await navigate('carrito.html', 550);
  const cartMetrics = await evaluate(`(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, columns: getComputedStyle(document.querySelector('.cart-layout')).gridTemplateColumns.split(' ').length }))()`);
  responsive.push({ width, height, categoryMetrics, cartMetrics });
}

const storedCart = await evaluate(`localStorage.getItem('fueradelugar_cart_v1')`);
await evaluate(`localStorage.setItem('fueradelugar_cart_v1', '[]')`);
await command('Page.reload');
await wait(3500);
const emptyCart = await evaluate(`(() => ({ title: document.querySelector('.empty-state h2')?.textContent, action: document.querySelector('.empty-state .btn')?.textContent, summaryHidden: document.querySelector('#cart-summary')?.hidden }))()`);
await evaluate(`localStorage.setItem('fueradelugar_cart_v1', ${JSON.stringify(storedCart)})`);

console.log(JSON.stringify({ categories, categoryDetailBefore, categoryDetailAfter, accessories, productReady, cartBefore, cartAfterQuantity, editor, editorUpdate, persistence, stockLimit, emptyCart, responsive, runtimeErrors }, null, 2));
socket.close();
