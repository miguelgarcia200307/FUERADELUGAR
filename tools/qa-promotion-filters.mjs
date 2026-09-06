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
const snapshot = async name => {
  const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`.qa/${name}.png`, Buffer.from(data, 'base64'));
};

await command('Runtime.enable');
await command('Page.enable');
await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await command('Page.navigate', { url: 'http://localhost:8080/promociones.html' });
await wait(6000);

const initial = await evaluate(`(() => ({
  title: document.title,
  products: document.querySelectorAll('#promotion-products .product-card').length,
  result: document.querySelector('#promotion-result-count')?.textContent,
  horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
  loadError: document.body.innerText.includes('No pudimos cargar esta página')
}))()`);

await evaluate(`document.querySelector('#open-promo-filters').click()`);
await wait(300);
const opened = await evaluate(`(() => {
  const panel = document.querySelector('#promotion-filters');
  const head = panel.querySelector('.filters__head');
  const body = panel.querySelector('.filters__body');
  const footer = panel.querySelector('.filters__apply');
  const checks = [...panel.querySelectorAll('input[type="checkbox"]')];
  return {
    open: panel.classList.contains('open'),
    panel: panel.getBoundingClientRect().toJSON(),
    head: head.getBoundingClientRect().toJSON(),
    body: body.getBoundingClientRect().toJSON(),
    footer: footer.getBoundingClientRect().toJSON(),
    bodyScrollable: body.scrollHeight > body.clientHeight,
    nestedScrollers: [...panel.querySelectorAll('.filter-options')].filter(node => node.scrollHeight > node.clientHeight).length,
    checkbox: checks[0] ? { width: checks[0].getBoundingClientRect().width, height: checks[0].getBoundingClientRect().height } : null,
    whatsappHidden: getComputedStyle(document.querySelector('.whatsapp-float')).visibility === 'hidden',
    sectionLabels: [...panel.querySelectorAll('.filter-section__toggle > span:first-child')].map(node => node.textContent.trim())
  };
})()`);
await snapshot('promotions-filter-open-390');

const cancel = await evaluate(`(() => {
  const before = document.querySelector('#promotion-result-count').textContent;
  document.querySelector('#promotion-filters input[type="checkbox"]').click();
  document.querySelector('.filters__close').click();
  const after = document.querySelector('#promotion-result-count').textContent;
  const url = location.search;
  document.querySelector('#open-promo-filters').click();
  return {
    resultsUnchanged: before === after,
    urlUnchanged: url === '',
    discardedOnReopen: !document.querySelector('#promotion-filters input[type="checkbox"]').checked
  };
})()`);

const search = await evaluate(`(() => {
  const find = (key, value) => {
    const section = document.querySelector('[data-filter-section="' + key + '"]');
    const toggle = section.querySelector('.filter-section__toggle');
    if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    const input = section.querySelector('[data-filter-search]');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return [...section.querySelectorAll('[data-filter-option]:not([hidden]) .filter-option__copy strong')].map(node => node.textContent.trim());
  };
  return { team: find('team', '  RÉAL  '), category: find('category', 'uniforme'), brand: find('brand', 'adid') };
})()`);

const selected = await evaluate(`(() => {
  const choose = (key, text) => {
    const section = document.querySelector('[data-filter-section="' + key + '"]');
    const toggle = section.querySelector('.filter-section__toggle');
    if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    const search = section.querySelector('[data-filter-search]');
    if (search) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
    const option = [...section.querySelectorAll('[data-filter-option]')].find(label => label.querySelector('.filter-option__copy strong')?.textContent.toLowerCase().includes(text));
    if (option) option.click();
    return Boolean(option);
  };
  return {
    category: choose('category', 'uniforme'),
    team: choose('team', 'real madrid'),
    brand: choose('brand', 'adidas'),
    countText: document.querySelector('.filters__selection').textContent,
    cta: document.querySelector('.filter-submit').textContent,
    ctaDisabled: document.querySelector('.filter-submit').disabled
  };
})()`);
await snapshot('promotions-filter-selected-390');

const applied = await evaluate(`(async () => {
  const button = document.querySelector('.filter-submit');
  if (!button.disabled) button.click();
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    closed: !document.querySelector('#promotion-filters').classList.contains('open'),
    buttonCount: document.querySelector('#promo-filter-count').textContent,
    chips: [...document.querySelectorAll('.active-filter-chips button span:first-child')].map(node => node.textContent.trim()),
    products: document.querySelectorAll('#promotion-products .product-card').length,
    result: document.querySelector('#promotion-result-count').textContent,
    url: location.search
  };
})()`);

await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true });
await wait(250);
await evaluate(`document.querySelector('#open-promo-filters').click()`);
await wait(250);
const narrow = await evaluate(`(() => ({
  horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
  panelRight: Math.round(document.querySelector('#promotion-filters').getBoundingClientRect().right),
  footerButtons: [...document.querySelectorAll('.filters__apply button')].map(button => ({ text: button.textContent, width: Math.round(button.getBoundingClientRect().width) }))
}))()`);
await snapshot('promotions-filter-open-320');

await command('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true });
await wait(150);
const wideMobile = await evaluate(`(() => ({
  horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
  panelWidth: Math.round(document.querySelector('#promotion-filters').getBoundingClientRect().width),
  footerVisible: document.querySelector('.filters__apply').getBoundingClientRect().bottom <= innerHeight
}))()`);

const chipActions = await evaluate(`(async () => {
  document.querySelector('.filters__close').click();
  const brandChip = [...document.querySelectorAll('[data-remove-filter]')].find(button => button.dataset.removeFilter === 'brand');
  brandChip.click();
  await new Promise(resolve => setTimeout(resolve, 30));
  const removed = {
    count: document.querySelector('#promo-filter-count').textContent,
    brandGone: !location.search.includes('brand='),
    chips: [...document.querySelectorAll('[data-remove-filter] span:first-child')].map(node => node.textContent.trim())
  };
  history.back();
  await new Promise(resolve => setTimeout(resolve, 100));
  const restored = {
    count: document.querySelector('#promo-filter-count').textContent,
    brandRestored: location.search.includes('brand=adidas')
  };
  document.querySelector('.active-filter-clear').click();
  await new Promise(resolve => setTimeout(resolve, 30));
  const cleared = {
    count: document.querySelector('#promo-filter-count').textContent,
    chipsHidden: document.querySelector('#promo-active-filters').hidden,
    products: document.querySelectorAll('#promotion-products .product-card').length,
    url: location.search
  };
  return { removed, restored, cleared };
})()`);

const zeroAndKeyboard = await evaluate(`(() => {
  document.querySelector('#open-promo-filters').click();
  const section = document.querySelector('[data-filter-section="price"]');
  const toggle = section.querySelector('.filter-section__toggle');
  if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  const minimum = section.querySelector('[name="minPrice"]');
  minimum.value = '999999999';
  minimum.dispatchEvent(new Event('input', { bubbles: true }));
  const zero = { label: document.querySelector('.filter-submit').textContent, disabled: document.querySelector('.filter-submit').disabled };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return { zero, escapeClosed: !document.querySelector('#promotion-filters').classList.contains('open') };
})()`);

await command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
await command('Page.navigate', { url: 'http://localhost:8080/promociones.html' });
await wait(2500);
const desktop = [];
for (const width of [1024, 1366, 1440, 1920]) {
  await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(100);
  desktop.push(await evaluate(`(() => {
    const panel = document.querySelector('#promotion-filters');
    const rect = panel.getBoundingClientRect();
    const body = panel.querySelector('.filters__body');
    return {
      viewport: [innerWidth, innerHeight],
      panel: { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top) },
      panelVisible: getComputedStyle(panel).visibility === 'visible',
      bodyScrollable: body.scrollHeight > body.clientHeight,
      nestedScrollers: [...panel.querySelectorAll('.filter-options')].filter(node => node.scrollHeight > node.clientHeight).length,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      products: document.querySelectorAll('#promotion-products .product-card').length
    };
  })()`));
}
await command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
await snapshot('promotions-filter-desktop-1366');

console.log(JSON.stringify({ initial, opened, cancel, search, selected, applied, narrow, wideMobile, chipActions, zeroAndKeyboard, desktop, errors }, null, 2));
socket.close();
