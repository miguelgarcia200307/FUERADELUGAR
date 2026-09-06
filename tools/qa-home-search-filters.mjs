import { writeFile } from 'node:fs/promises';

const tabs = await fetch('http://localhost:9224/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page');
if (!page) throw new Error('No Chrome page found');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let id = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    message.error ? callbacks.reject(new Error(message.error.message)) : callbacks.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
});
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  pending.set(requestId, { resolve, reject });
  socket.send(JSON.stringify({ id: requestId, method, params }));
});
const evaluate = expression => command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).then(result => {
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
});
const wait = duration => new Promise(resolve => setTimeout(resolve, duration));
const screenshot = async name => {
  const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`.qa/${name}.png`, Buffer.from(data, 'base64'));
};

await command('Runtime.enable');
await command('Log.enable');
await command('Page.enable');
await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await command('Page.navigate', { url: 'http://localhost:8080/index.html' });
await wait(6000);

const initial = await evaluate(`(() => {
  const input = document.querySelector('#mobile-search');
  const button = document.querySelector('.home-search-toolbar--mobile .home-filter-trigger');
  return {
    searchHeight: Math.round(input.getBoundingClientRect().height),
    buttonHeight: Math.round(button.getBoundingClientRect().height),
    buttonWidth: Math.round(button.getBoundingClientRect().width),
    toolbarWidth: Math.round(button.closest('.home-search-toolbar').getBoundingClientRect().width),
    discoveryVisible: !document.querySelector('#home-discovery').hidden,
    resultsHidden: document.querySelector('#home-results').hidden,
    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    promotionCards: document.querySelectorAll('#promo-products .product-card').length
  };
})()`);
await screenshot('home-toolbar-390');

await evaluate(`document.querySelector('.home-search-toolbar--mobile .home-filter-trigger').click()`);
await wait(3500);
const opened = await evaluate(`(() => {
  const panel = document.querySelector('#home-filters');
  const body = panel.querySelector('.filters__body');
  return {
    open: panel.classList.contains('open'),
    height: Math.round(panel.getBoundingClientRect().height),
    checkbox: Math.round(panel.querySelector('input[type="checkbox"]').getBoundingClientRect().width),
    bodyScrollable: body.scrollHeight > body.clientHeight,
    nestedScrollers: [...panel.querySelectorAll('.filter-options')].filter(node => node.scrollHeight > node.clientHeight).length,
    footerVisible: panel.querySelector('.filters__apply').getBoundingClientRect().bottom <= innerHeight,
    whatsappHidden: getComputedStyle(document.querySelector('.whatsapp-float')).visibility === 'hidden'
  };
})()`);

const cancel = await evaluate(`(() => {
  const first = document.querySelector('#home-filters input[type="checkbox"]');
  first.click();
  document.querySelector('#home-filters .filters__close').click();
  const result = {
    discoveryStillVisible: !document.querySelector('#home-discovery').hidden,
    badgeStillHidden: document.querySelector('.home-search-toolbar--mobile [data-home-filter-count]').hidden,
    urlUnchanged: location.search === ''
  };
  document.querySelector('.home-search-toolbar--mobile .home-filter-trigger').click();
  result.draftDiscarded = !document.querySelector('#home-filters input[type="checkbox"]').checked;
  return result;
})()`);

const selected = await evaluate(`(() => {
  const choose = (key, text) => {
    const section = document.querySelector('[data-filter-section="' + key + '"]');
    const toggle = section.querySelector('.filter-section__toggle');
    if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    const search = section.querySelector('[data-filter-search]');
    if (search) { search.value = text; search.dispatchEvent(new Event('input', { bubbles: true })); }
    const option = [...section.querySelectorAll('[data-filter-option]')].find(label => label.querySelector('.filter-option__copy strong')?.textContent.toLowerCase().includes(text));
    option?.click();
    return option?.querySelector('.filter-option__copy strong')?.textContent || null;
  };
  return {
    category: choose('category', 'uniformes de fútbol adulto'),
    team: choose('team', 'real madrid'),
    color: choose('color', 'blanco'),
    size: choose('size', 'm'),
    count: document.querySelector('.filters__selection').textContent,
    cta: document.querySelector('.filter-submit').textContent,
    disabled: document.querySelector('.filter-submit').disabled
  };
})()`);
await screenshot('home-filter-selected-390');

const applied = await evaluate(`(async () => {
  document.querySelector('.filter-submit').click();
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    resultMode: !document.querySelector('#home-results').hidden,
    discoveryHidden: document.querySelector('#home-discovery').hidden,
    badge: document.querySelector('.home-search-toolbar--mobile [data-home-filter-count]').textContent,
    chips: [...document.querySelectorAll('#home-active-filters [data-remove-filter] span:first-child')].map(node => node.textContent.trim()),
    products: document.querySelectorAll('#home-result-products .product-card').length,
    resultText: document.querySelector('#home-result-count').textContent,
    url: location.search
  };
})()`);
await screenshot('home-results-filtered-390');

const chipRemoval = await evaluate(`(async () => {
  const chip = [...document.querySelectorAll('#home-active-filters [data-remove-filter]')].find(button => button.dataset.removeFilter === 'color');
  chip.click();
  await new Promise(resolve => setTimeout(resolve, 50));
  const removed = {
    badge: document.querySelector('.home-search-toolbar--mobile [data-home-filter-count]').textContent,
    colorGone: !location.search.includes('color='),
    chips: [...document.querySelectorAll('#home-active-filters [data-remove-filter] span:first-child')].map(node => node.textContent.trim())
  };
  history.back();
  await new Promise(resolve => setTimeout(resolve, 100));
  return { removed, restoredBadge: document.querySelector('.home-search-toolbar--mobile [data-home-filter-count]').textContent, colorRestored: location.search.includes('color=Blanco') };
})()`);

const searchAndFilter = await evaluate(`(async () => {
  const input = document.querySelector('#mobile-search');
  input.value = 'camiseta';
  input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 100));
  const combined = {
    query: new URLSearchParams(location.search).get('q'),
    badge: document.querySelector('.home-search-toolbar--mobile [data-home-filter-count]').textContent,
    title: document.querySelector('#home-results-title').textContent,
    products: document.querySelectorAll('#home-result-products .product-card').length
  };
  document.querySelector('#mobile-search').value = '';
  document.querySelector('.home-search-toolbar--mobile .market-search__clear').click();
  await new Promise(resolve => setTimeout(resolve, 50));
  const searchCleared = { resultMode: !document.querySelector('#home-results').hidden, badge: document.querySelector('.home-search-toolbar--mobile [data-home-filter-count]').textContent };
  input.value = 'camiseta';
  input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 50));
  document.querySelector('#home-active-filters .active-filter-clear').click();
  await new Promise(resolve => setTimeout(resolve, 50));
  const filtersCleared = { resultMode: !document.querySelector('#home-results').hidden, query: new URLSearchParams(location.search).get('q'), badgeHidden: document.querySelector('.home-search-toolbar--mobile [data-home-filter-count]').hidden };
  document.querySelector('.home-search-toolbar--mobile .market-search__clear').click();
  await new Promise(resolve => setTimeout(resolve, 50));
  const allCleared = { discoveryVisible: !document.querySelector('#home-discovery').hidden, resultsHidden: document.querySelector('#home-results').hidden, url: location.search };
  return { combined, searchCleared, filtersCleared, allCleared };
})()`);

const suggestions = await evaluate(`(async () => {
  const input = document.querySelector('#mobile-search');
  input.focus();
  for (const value of ['r','re','rea','real','real madrid']) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await new Promise(resolve => setTimeout(resolve, 800));
  return { open: !input.closest('form').querySelector('.search-suggestions').hidden, text: input.closest('form').querySelector('.search-suggestions').innerText, value: input.value };
})()`);

const responsive = [];
for (const [width, height] of [[320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await wait(80);
  responsive.push(await evaluate(`(() => {
    const toolbar = document.querySelector(innerWidth < 800 ? '.home-search-toolbar--mobile' : '.home-search-toolbar--desktop');
    const input = toolbar.querySelector('input');
    const button = toolbar.querySelector('.home-filter-trigger');
    return { viewport: [innerWidth,innerHeight], inputHeight: Math.round(input.getBoundingClientRect().height), buttonHeight: Math.round(button.getBoundingClientRect().height), buttonVisible: button.getBoundingClientRect().width >= 44, overflow: Math.max(0,document.documentElement.scrollWidth-innerWidth) };
  })()`));
}

await command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
await command('Page.navigate', { url: 'http://localhost:8080/index.html' });
await wait(3000);
await evaluate(`document.querySelector('.home-search-toolbar--desktop .home-filter-trigger').click()`);
await wait(2500);
const desktopDrawer = await evaluate(`(() => {
  const panel = document.querySelector('#home-filters');
  return { open: panel.classList.contains('open'), width: Math.round(panel.getBoundingClientRect().width), right: Math.round(panel.getBoundingClientRect().right), footerVisible: panel.querySelector('.filters__apply').getBoundingClientRect().bottom <= innerHeight };
})()`);
await screenshot('home-filter-desktop-1366');

console.log(JSON.stringify({ initial, opened, cancel, selected, applied, chipRemoval, searchAndFilter, suggestions, responsive, desktopDrawer, errors }, null, 2));
socket.close();
