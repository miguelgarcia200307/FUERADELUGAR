const tabs = await fetch('http://127.0.0.1:9224/json/list').then(response => response.json());
const page = tabs.find(tab => tab.type === 'page' && tab.url.startsWith('http://localhost:8080/'));
if (!page) throw new Error('No se encontró una pestaña local para QA de rutas de equipo.');

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

async function waitFor(expression, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await delay(120);
  }
  throw new Error(`Tiempo agotado esperando: ${expression}`);
}

async function navigate(url, readyExpression) {
  await command('Page.navigate', { url });
  await waitFor(readyExpression);
}

const teamReady = `document.querySelector('#team-collection-header')?.getAttribute('aria-busy') === 'false' && document.querySelector('#listing-products')?.getAttribute('aria-busy') === 'false'`;
const signatureExpression = `(() => ({
  path: location.pathname,
  search: location.search,
  canonical: document.querySelector('link[rel="canonical"]')?.href || '',
  breadcrumb: document.querySelector('#breadcrumbs')?.textContent.replace(/\\s+/g, ' ').trim() || '',
  heading: document.querySelector('#listing-title')?.textContent.trim() || '',
  meta: document.querySelector('#team-meta')?.textContent.trim() || '',
  description: document.querySelector('#listing-description')?.textContent.trim() || '',
  toolbarCount: document.querySelectorAll('.team-catalog-toolbar').length,
  compactHeaderCount: document.querySelectorAll('.team-collection-header').length,
  crest: Boolean(document.querySelector('#team-crest img,.team-collection-crest.team-crest--fallback')),
  products: [...document.querySelectorAll('.product-card')].map(card => card.dataset.productId),
  productMeta: [...document.querySelectorAll('.product-card__meta')].map(item => item.textContent.trim()),
  hasLegacyHero: /TODO PARA TU JUEGO/i.test(document.querySelector('main')?.textContent || '')
}))()`;

async function signature() {
  return evaluate(signatureExpression);
}

async function clickTeamLink(rootSelector, teamName = 'Real Madrid') {
  const result = await evaluate(`(() => {
    const links = [...document.querySelectorAll(${JSON.stringify(rootSelector)} + ' a.team-card')];
    const link = links.find(item => item.textContent.includes(${JSON.stringify(teamName)}));
    if (!link) return { clicked: false, available: links.map(item => item.textContent.replace(/\\s+/g, ' ').trim()) };
    const href = link.getAttribute('href');
    link.click();
    return { clicked: true, href };
  })()`);
  if (!result.clicked) throw new Error(`No se encontró ${teamName} en ${rootSelector}: ${result.available.join(', ')}`);
  return result.href;
}

await command('Runtime.enable');
await command('Page.enable');
await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

await navigate('http://localhost:8080/index.html', `!document.querySelector('#home-team-section')?.hidden && document.querySelector('#home-teams .team-card')`);
const homeTeamHrefs = await evaluate(`[...document.querySelectorAll('#home-teams a.team-card')].map(link => link.getAttribute('href'))`);
await evaluate(`document.querySelector('#home-team-section .section-heading > a').click()`);
await waitFor(`document.querySelector('#all-teams')?.getAttribute('aria-busy') === 'false'`);
const homeDirectoryHref = await clickTeamLink('#all-teams');
await waitFor(teamReady);
const fromHome = await signature();

await navigate('http://localhost:8080/equipos.html', `document.querySelector('#all-teams')?.getAttribute('aria-busy') === 'false'`);
const directoryHref = await clickTeamLink('#all-teams');
await waitFor(teamReady);
const fromDirectory = await signature();

await navigate('http://localhost:8080/index.html', `document.querySelector('[data-search-form] input')`);
await evaluate(`(() => {
  const input = document.querySelector('[data-search-form] input');
  input.focus();
  input.value = 'Real Madrid';
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await waitFor(`document.querySelector('.search-result--team')?.textContent.includes('Real Madrid')`);
const searchHref = await evaluate(`document.querySelector('.search-result--team').getAttribute('href')`);
await evaluate(`document.querySelector('.search-result--team').click()`);
await waitFor(teamReady);
const fromSearch = await signature();

await navigate('http://localhost:8080/equipo.html?slug=real-madrid', teamReady);
const direct = await signature();

await navigate('http://localhost:8080/equipo.html?team=real-madrid', teamReady);
const legacySlug = await signature();

const teamId = await evaluate(`import('/js/lib/api.js').then(api => api.getEntityBySlug('team', 'real-madrid')).then(team => team.id)`);
await navigate(`http://localhost:8080/equipo.html?id=${teamId}`, teamReady);
const legacyId = await signature();

await evaluate(`document.querySelector('.product-card h3 a').click()`);
await waitFor(`document.body?.dataset.page === 'product' && document.querySelector('#product-detail h1')`);
await evaluate(`history.back()`);
await waitFor(teamReady);
const afterBack = await signature();

const sampleTeams = {};
for (const slug of ['barcelona', 'colombia', 'junior', 'nacional']) {
  await navigate(`http://localhost:8080/equipo.html?slug=${slug}`, teamReady);
  sampleTeams[slug] = await evaluate(`(async () => {
    const ids = [...document.querySelectorAll('.product-card')].map(card => card.dataset.productId);
    const products = await import('/js/lib/api.js').then(api => api.getProductsByIds(ids));
    return {
      heading: document.querySelector('#listing-title').textContent.trim(),
      meta: document.querySelector('#team-meta').textContent.trim(),
      compactHeaderCount: document.querySelectorAll('.team-collection-header').length,
      toolbarCount: document.querySelectorAll('.team-catalog-toolbar').length,
      allProductsFromTeam: products.every(product => product.teams?.slug === ${JSON.stringify(slug)}),
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  })()`);
}

const noProductTeam = await evaluate(`Promise.all([
  import('/js/lib/api.js').then(api => api.getTeams()),
  import('/js/lib/api.js').then(api => api.getPublishedProductCountsByTeam())
]).then(([teams, counts]) => teams.find(team => !counts[team.id]) || null)`);
let emptyTeam = { tested: false };
if (noProductTeam) {
  await navigate(`http://localhost:8080/equipo.html?slug=${noProductTeam.slug}`, teamReady);
  emptyTeam = await evaluate(`(() => ({
    tested: true,
    heading: document.querySelector('#listing-title').textContent.trim(),
    meta: document.querySelector('#team-meta').textContent.trim(),
    emptyHeading: document.querySelector('.team-filter-empty h2')?.textContent.trim() || '',
    compactHeaderCount: document.querySelectorAll('.team-collection-header').length,
    toolbarCount: document.querySelectorAll('.team-catalog-toolbar').length
  }))()`);
}

const comparable = value => ({ ...value, search: '?slug=real-madrid' });
const reference = JSON.stringify(comparable(direct));
const comparisons = Object.fromEntries(Object.entries({ fromHome, fromDirectory, fromSearch, legacySlug, legacyId, afterBack })
  .map(([name, value]) => [name, JSON.stringify(comparable(value)) === reference]));

const hrefs = { homeTeamHrefs, homeDirectoryHref, directoryHref, searchHref };
const allCanonicalHrefs = homeTeamHrefs.every(href => href.startsWith('equipo.html?slug='))
  && [homeDirectoryHref, directoryHref, searchHref].every(href => href === 'equipo.html?slug=real-madrid');
const allEquivalent = Object.values(comparisons).every(Boolean);
const samplesValid = Object.values(sampleTeams).every(team => team.compactHeaderCount === 1 && team.toolbarCount === 1 && team.allProductsFromTeam && !team.overflow);
const emptyValid = !emptyTeam.tested || (emptyTeam.meta.includes('0 productos') && emptyTeam.compactHeaderCount === 1 && emptyTeam.toolbarCount === 1);
if (!allCanonicalHrefs || !allEquivalent || !samplesValid || !emptyValid || runtimeErrors.length) {
  throw new Error(JSON.stringify({ hrefs, comparisons, direct, fromSearch, sampleTeams, emptyTeam, runtimeErrors }, null, 2));
}

console.log(JSON.stringify({ hrefs, comparisons, direct, sampleTeams, emptyTeam, runtimeErrors }, null, 2));
socket.close();
