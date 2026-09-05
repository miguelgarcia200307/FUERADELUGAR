import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tabs = await fetch('http://localhost:9223/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page' && tab.url.startsWith('http://localhost:8080'));
if (!page) throw new Error('No se encontró la pestaña local para QA del footer.');

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
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    return message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails?.text || 'Runtime exception');
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') runtimeErrors.push(message.params.entry.text);
});

function command(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const evaluate = expression => command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  .then(result => {
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Error evaluando en el navegador');
    return result.result.value;
  });

await command('Runtime.enable');
await command('Log.enable');
await command('Page.enable');

await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await command('Page.navigate', { url: 'http://localhost:8080/' });
await delay(3000);

const semantics = await evaluate(`(async () => {
  const links = [...document.querySelectorAll('[data-site-footer] a')];
  const byText = text => links.find(link => link.textContent.includes(text));
  const internal = ['Catálogo','Categorías','Equipos','Promociones'].map(label => {
    const link = byText(label);
    return { label, href: link?.getAttribute('href'), status: link ? null : 0 };
  });
  for (const item of internal) item.status = item.href ? (await fetch(item.href)).status : 0;
  const whatsapp = document.querySelector('.footer-action--primary');
  const instagram = byText('Instagram');
  const admin = byText('Administrar');
  return {
    headings: [...document.querySelectorAll('.footer-section h2')].map(node => node.textContent.trim()),
    brandLines: [...document.querySelectorAll('.footer-brand p span')].map(node => node.textContent.trim()),
    internal,
    whatsapp: whatsapp ? { host: new URL(whatsapp.href).host, message: new URL(whatsapp.href).searchParams.get('text'), target: whatsapp.target, aria: whatsapp.getAttribute('aria-label') } : null,
    instagram: instagram ? { host: new URL(instagram.href).host, path: new URL(instagram.href).pathname, target: instagram.target, aria: instagram.getAttribute('aria-label') } : null,
    mapsPresent: Boolean(byText('Cómo llegar')),
    admin: admin ? { path: new URL(admin.href).pathname, status: (await fetch(admin.href)).status } : null,
    copyright: document.querySelector('.footer-closing span')?.textContent,
    trust: [...document.querySelectorAll('.footer-trust li')].map(node => node.textContent.trim()),
    decorativeIconsHidden: [...document.querySelectorAll('[data-site-footer] svg')].every(svg => svg.getAttribute('aria-hidden') === 'true')
  };
})()`);

const fallbackStates = await evaluate(`(async () => {
  const { renderFooter } = await import('/js/components/layout.js');
  const parse = settings => new DOMParser().parseFromString(renderFooter(settings), 'text/html');
  const base = { business_name: 'Tienda prueba', whatsapp: '57 300 000 0000', address: 'Dirección prueba', city: 'Ciudad - Región' };
  const empty = parse({ ...base, schedule: '', instagram: '', maps_url: '', phone: '', email: '' });
  const complete = parse({ ...base, schedule: 'Lun - Sáb', instagram: '@tienda_prueba', maps_url: 'https://maps.google.com/?q=tienda', phone: '+57 300 000 0000', email: 'hola@example.com' });
  return {
    empty: {
      scheduleHidden: !empty.body.textContent.includes('Horario'),
      instagramHidden: ![...empty.querySelectorAll('a')].some(a => a.textContent.includes('Instagram')),
      mapsHidden: ![...empty.querySelectorAll('a')].some(a => a.textContent.includes('Cómo llegar')),
      noBrokenHref: ![...empty.querySelectorAll('a')].some(a => /undefined|null/.test(a.getAttribute('href') || ''))
    },
    complete: {
      scheduleVisible: complete.body.textContent.includes('Lun - Sáb'),
      instagramVisible: complete.body.textContent.includes('Instagram'),
      mapsVisible: complete.body.textContent.includes('Cómo llegar'),
      phoneVisible: complete.body.textContent.includes('+57 300 000 0000'),
      emailVisible: complete.body.textContent.includes('hola@example.com')
    }
  };
})()`);

const viewports = [];
for (const [width, height] of [[320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]]) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await evaluate('scrollTo(0, document.documentElement.scrollHeight)');
  await delay(260);
  viewports.push(await evaluate(`(() => {
    const footer = document.querySelector('[data-site-footer]');
    const nav = document.querySelector('.mobile-nav');
    const closingCopy = document.querySelector('.footer-closing span');
    const actionColumns = getComputedStyle(document.querySelector('.footer-actions')).gridTemplateColumns.split(' ').length;
    const areas = getComputedStyle(document.querySelector('.footer-grid')).gridTemplateAreas;
    const float = document.querySelector('.whatsapp-float');
    return {
      size: [innerWidth, innerHeight],
      overflow: document.documentElement.scrollWidth > innerWidth,
      footerHeight: Math.round(footer.getBoundingClientRect().height),
      actionColumns,
      gridAreas: areas,
      bottomNavVisible: getComputedStyle(nav).display !== 'none',
      closingAboveNav: getComputedStyle(nav).display === 'none' || closingCopy.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top,
      floatHiddenAtFooter: float.classList.contains('is-footer-hidden') && getComputedStyle(float).visibility === 'hidden'
  };
  })()`));
}

const screenshots = {};
for (const [label, width, height] of [['mobile',390,844],['desktop',1440,900]]) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await evaluate('scrollTo(0, document.documentElement.scrollHeight)');
  await delay(260);
  const capture = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  screenshots[label] = join(tmpdir(), `fuera-de-lugar-footer-${label}.png`);
  await writeFile(screenshots[label], Buffer.from(capture.data, 'base64'));
}

await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await evaluate('scrollTo(0,0)');
await delay(260);
const floatReturns = await evaluate(`(() => {
  const float = document.querySelector('.whatsapp-float');
  return !float.classList.contains('is-footer-hidden') && getComputedStyle(float).visibility === 'visible' && float.tabIndex === 0;
})()`);

const routes = [];
for (const route of ['catalogo.html','categorias.html','promociones.html','favoritos.html','carrito.html','producto.html?slug=balon-futbol-match-numero-5','equipos.html','equipo.html?slug=real-madrid','marca.html?slug=adidas','checkout.html']) {
  await command('Page.navigate', { url: `http://localhost:8080/${route}` });
  await delay(1100);
  routes.push(await evaluate(`(() => ({
    route: location.pathname + location.search,
    footer: Boolean(document.querySelector('[data-site-footer]')),
    adminLink: document.querySelector('.footer-closing a')?.getAttribute('href'),
    overflow: document.documentElement.scrollWidth > innerWidth,
    appError: document.querySelector('.empty-state h1')?.textContent === 'No pudimos cargar esta página'
  }))()`));
}

console.log(JSON.stringify({ semantics, fallbackStates, viewports, floatReturns, routes, runtimeErrors, screenshots }, null, 2));
await command('Browser.close');
socket.close();
