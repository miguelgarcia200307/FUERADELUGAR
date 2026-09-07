import { getBrands, getCategories, getDiscountSortedProductIds, getEntityBySlug, getFilterOptions, getProducts, getProductsByIds, getPublishedProductCountsByTeam, getTeams, searchProducts } from '../lib/api.js';
import { loadSettings } from '../components/layout.js';
import { renderProducts, renderProductSkeletons } from '../components/product-card.js';
import { renderProductSection } from '../components/product-section.js';
import { toast } from '../components/toast.js';
import { buildProductFilterSections, createFilterPanel } from '../components/filter-panel.js';
import { $, $$, categoryInitials, currentPrice, debounce, discountPercent, emptyState, escapeHtml, getCategoryUrl, getTeamUrl, isPromoActive, localAsset, normalizeText, params, routeSlug, sharePage } from '../lib/helpers.js';
import { getFavorites, setFavorites } from '../lib/store.js';

const PAGE_SIZE = 20;

export async function initHome() {
  const [categories, teams, promos, newest, featured, settings] = await Promise.all([
    getCategories(), getTeams(), getProducts({ pageSize: 8, promotion: true }),
    getProducts({ pageSize: 8, sort: 'newest' }), getProducts({ pageSize: 8, featured: true }), loadSettings()
  ]);
  const parents = categories.filter(category => !category.parent_id && category.slug !== 'promo').slice(0, 8);
  const categoriesRoot = $('#home-categories');
  categoriesRoot.classList.remove('skeleton-row');
  categoriesRoot.innerHTML = parents.map(categoryQuickItem).join('');

  const promoted = promos.products
    .filter(product => product.promo_price != null)
    .sort((a, b) => Number(isAvailable(b)) - Number(isAvailable(a)) || discountPercent(b) - discountPercent(a))
    .slice(0, 8);
  const promoSection = $('#home-promotions');
  if (promoted.length) {
    $('#promo-products').classList.remove('skeleton-grid');
    renderProducts($('#promo-products'), promoted);
  } else promoSection.hidden = true;

  renderProductSection($('#home-new'), {
    eyebrow: 'Acaban de llegar', title: 'Recién llegados', products: newest.products.slice().sort((a, b) => Number(isAvailable(b)) - Number(isAvailable(a))).slice(0, 8), seeAllUrl: 'catalogo.html?sort=newest'
  });

  if (teams.length) {
    $('#home-team-section').hidden = false;
    const teamsRoot = $('#home-teams');
    teamsRoot.classList.remove('skeleton-row');
    teamsRoot.innerHTML = teams.slice(0, 8).map(teamCard).join('');
  }

  const featuredProducts = featured.products.filter(isAvailable).slice(0, 8);
  renderProductSection($('#home-featured'), {
    eyebrow: 'Selección de la tienda', title: 'Para ti', products: featuredProducts, seeAllUrl: 'catalogo.html'
  });

  const commercialCategories = [
    { slugs: ['uniformes-futbol-adulto', 'uniformes-futbol-nino'], title: 'Uniformes', eyebrow: 'Viste tus colores' },
    { slugs: ['guayos'], title: 'Guayos para la cancha', eyebrow: 'Juega con todo' },
    { slugs: ['ropa-deportiva'], title: 'Para entrenar', eyebrow: 'Ropa deportiva' }
  ];
  const categorySections = await Promise.all(commercialCategories.map(async section => {
    const matches = categories.filter(category => section.slugs.includes(category.slug));
    if (!matches.length) return { ...section, products: [], url: 'catalogo.html' };
    const children = categories.filter(category => matches.some(parent => category.parent_id === parent.id));
    const result = await getProducts({ categoryId: [...matches, ...children].map(item => item.id), pageSize: 8 });
    return { ...section, products: result.products.filter(isAvailable).slice(0, 8), url: getCategoryUrl(matches[0].slug) };
  }));
  $('#home-category-sections').innerHTML = categorySections.map((section, index) => `<section class="commerce-section${index % 2 ? ' commerce-section--soft' : ''}" data-category-section="${index}"></section>`).join('');
  categorySections.forEach((section, index) => renderProductSection($(`[data-category-section="${index}"]`), {
    eyebrow: section.eyebrow, title: section.title, products: section.products, seeAllUrl: section.url
  }));

  $('#store-info').innerHTML = `<div class="store-info__intro"><span class="section-kicker">Compra con confianza</span><h2>Estamos en Valledupar</h2><p>Explora, elige tus variantes y arma el carrito. Confirmamos disponibilidad y coordinamos tu pedido directamente por WhatsApp.</p></div><div class="store-info__cards"><article><span>Ubicación</span><strong>${escapeHtml(settings.address || '')}</strong><small>${escapeHtml(settings.city || '')}</small></article><article><span>Horario</span><strong>${escapeHtml(settings.schedule || 'Consulta por WhatsApp')}</strong></article><a href="https://wa.me/${encodeURIComponent(settings.whatsapp)}" target="_blank" rel="noopener"><span>Atención directa</span><strong>Hablar por WhatsApp <b>›</b></strong></a>${settings.maps_url ? `<a href="${escapeHtml(settings.maps_url)}" target="_blank" rel="noopener"><span>Cómo llegar</span><strong>Abrir Google Maps <b>↗</b></strong></a>` : ''}</div>`;
  await initHomeResults({ categories, teams });
}

function homeFilterCount(state) {
  return ['category','team','brand','color','size'].reduce((count, key) => count + (state[key]?.length || 0), 0)
    + Number(Boolean(state.minPrice || state.maxPrice))
    + Number(Boolean(state.availability))
    + Number(Boolean(state.promotionOnly));
}

function writeHomeUrl(state, replace = false) {
  const query = new URLSearchParams();
  const names = { minPrice: 'min', maxPrice: 'max', promotionOnly: 'promotion' };
  for (const [key, value] of Object.entries(state)) {
    const serialized = Array.isArray(value) ? value.join(',') : value;
    if (serialized && key !== 'page' && !(key === 'sort' && serialized === 'relevance')) query.set(names[key] || key, serialized);
  }
  history[replace ? 'replaceState' : 'pushState'](null, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
}

async function initHomeResults({ categories, teams }) {
  const query = params();
  const state = {
    q: query.get('q')?.trim().replace(/\s+/g, ' ') || '',
    page: 0,
    sort: query.get('sort') || 'relevance',
    category: readFilterList(query, 'category'),
    team: readFilterList(query, 'team'),
    brand: readFilterList(query, 'brand'),
    color: readFilterList(query, 'color'),
    size: readFilterList(query, 'size'),
    minPrice: query.get('min') || '',
    maxPrice: query.get('max') || '',
    availability: query.get('availability') || '',
    promotionOnly: query.get('promotion') || ''
  };
  const triggers = $$('[data-home-filter-trigger]');
  const filterRoot = $('#home-filters');
  const resultsSection = $('#home-results');
  const discovery = $('#home-discovery');
  const productRoot = $('#home-result-products');
  const sortSelect = $('#home-result-sort');
  let panel;
  let productPool = [];
  let setupPromise;

  function syncSearchInputs() {
    $$('[data-search-form]').forEach(form => {
      const input = form.querySelector('input[name="q"]');
      const clear = form.querySelector('.market-search__clear');
      const suggestions = form.querySelector('.search-suggestions');
      if (input) input.value = state.q;
      if (clear) clear.hidden = !state.q;
      if (suggestions) suggestions.hidden = true;
      input?.setAttribute('aria-expanded', 'false');
      form.classList.remove('is-open');
    });
  }

  function updateFilterTriggers() {
    const count = homeFilterCount(state);
    triggers.forEach(trigger => {
      trigger.classList.toggle('is-active', count > 0);
      const badge = trigger.querySelector('[data-home-filter-count]');
      badge.textContent = count;
      badge.hidden = !count;
    });
  }

  function variantSnapshot(product, candidate) {
    const selectedColorIds = new Set((product.product_colors || []).filter(color => candidate.color.includes(color.name)).map(color => color.id));
    const selectedSizeIds = new Set((product.product_sizes || []).filter(size => candidate.size.includes(size.name)).map(size => size.id));
    const variants = (product.product_variants || []).filter(variant => variant.active
      && (!candidate.color.length || selectedColorIds.has(variant.color_id))
      && (!candidate.size.length || selectedSizeIds.has(variant.size_id)));
    return { variants, stock: product.force_sold_out ? 0 : variants.reduce((total, variant) => total + Number(variant.stock || 0), 0) };
  }

  function matchesSearch(product, term) {
    if (!term) return true;
    const haystack = normalizeText([
      product.name, product.description, product.material, product.teams?.name, product.brands?.name,
      ...(product.product_categories || []).map(item => item.categories?.name),
      ...(product.product_colors || []).map(item => item.name),
      ...(product.product_sizes || []).map(item => item.name)
    ].filter(Boolean).join(' '));
    return normalizeText(term).split(' ').filter(Boolean).every(word => haystack.includes(word));
  }

  function getMatches(candidate) {
    return productPool.filter(product => {
      const productCategories = (product.product_categories || []).map(item => item.categories?.slug).filter(Boolean);
      const snapshot = variantSnapshot(product, candidate);
      const lowStock = snapshot.stock > 0 && (product.force_last_units || snapshot.stock <= 3);
      return matchesSearch(product, candidate.q)
        && (!candidate.category.length || candidate.category.some(value => productCategories.includes(value)))
        && (!candidate.team.length || candidate.team.includes(product.teams?.slug))
        && (!candidate.brand.length || candidate.brand.includes(product.brands?.slug))
        && ((!candidate.color.length && !candidate.size.length) || snapshot.variants.length > 0)
        && (!candidate.availability || candidate.availability === 'available' && snapshot.stock > 0 || candidate.availability === 'low' && lowStock || candidate.availability === 'sold' && snapshot.stock === 0)
        && (!candidate.promotionOnly || isPromoActive(product))
        && (!candidate.minPrice || currentPrice(product) >= Number(candidate.minPrice))
        && (!candidate.maxPrice || currentPrice(product) <= Number(candidate.maxPrice));
    });
  }

  function compareHomeResults(a, b) {
    if (state.sort === 'discount') return discountPercent(b) - discountPercent(a);
    if (state.sort === 'price-asc') return currentPrice(a) - currentPrice(b);
    if (state.sort === 'price-desc') return currentPrice(b) - currentPrice(a);
    if (state.sort === 'name') return a.name.localeCompare(b.name, 'es');
    if (state.sort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    return Number(isAvailable(b)) - Number(isAvailable(a)) || Number(b.featured) - Number(a.featured) || new Date(b.created_at) - new Date(a.created_at);
  }

  function renderResults() {
    const active = Boolean(state.q || homeFilterCount(state));
    resultsSection.hidden = !active;
    discovery.hidden = active;
    updateFilterTriggers();
    syncSearchInputs();
    if (!active || !panel) return;
    const matches = getMatches(state).sort(compareHomeResults);
    const visible = matches.slice(0, (state.page + 1) * PAGE_SIZE);
    $('#home-results-title').textContent = state.q ? `Resultados para “${state.q}”` : 'Resultados';
    $('#home-result-count').textContent = `${matches.length} producto${matches.length === 1 ? '' : 's'} encontrado${matches.length === 1 ? '' : 's'}`;
    if (visible.length) renderProducts(productRoot, visible);
    else productRoot.innerHTML = `<div class="empty-state"><span class="empty-state__icon" aria-hidden="true">⌕</span><h2>No encontramos productos con estos filtros</h2><p>Prueba quitando un filtro o cambiando la búsqueda.</p><div class="empty-state__actions"><button class="btn btn--primary" type="button" data-clear-home-results>Limpiar todo</button><a class="btn btn--ghost" href="catalogo.html">Ver catálogo</a></div></div>`;
    $('#home-load-more').hidden = visible.length >= matches.length;
    productRoot.querySelector('[data-clear-home-results]')?.addEventListener('click', clearEverything);
  }

  async function ensurePanel({ open = false } = {}) {
    if (!setupPromise) setupPromise = (async () => {
      triggers.forEach(trigger => { trigger.disabled = true; trigger.classList.add('is-loading'); });
      const [brands, options, first] = await Promise.all([getBrands(), getFilterOptions(), getProducts({ pageSize: 500, sort: 'featured' })]);
      productPool = [...first.products];
      for (let page = 1; productPool.length < (first.count || 0); page += 1) {
        const next = await getProducts({ page, pageSize: 500, sort: 'featured' });
        productPool.push(...next.products);
        if (!next.products.length) break;
      }
      const sections = buildProductFilterSections({ categories, teams, brands, options, context: 'catalog' });
      panel = createFilterPanel({
        root: filterRoot,
        triggers,
        chipsRoot: $('#home-active-filters'),
        title: 'Filtrar productos',
        sections,
        initialState: state,
        resultNoun: { singular: 'producto', plural: 'productos' },
        chipsClearLabel: 'Limpiar filtros',
        desktopMode: 'drawer',
        getResultCount: draft => getMatches({ ...draft, q: state.q }).length,
        onApply: async next => {
          Object.assign(state, next, { q: state.q, page: 0 });
          writeHomeUrl(state);
          renderResults();
          toast(homeFilterCount(state) ? 'Filtros aplicados' : 'Filtros limpiados');
        },
        onRemove: async (key, value) => {
          if (key === 'price') { state.minPrice = ''; state.maxPrice = ''; }
          else if (Array.isArray(state[key])) state[key] = state[key].filter(item => item !== value);
          else state[key] = '';
          state.page = 0;
          writeHomeUrl(state);
          panel.setApplied(state);
          renderResults();
        },
        onClear: clearFilters
      });
      $('#home-filter-backdrop').addEventListener('click', () => panel.close());
      triggers.forEach(trigger => { trigger.disabled = false; trigger.classList.remove('is-loading'); });
      updateFilterTriggers();
    })().catch(error => {
      setupPromise = null;
      triggers.forEach(trigger => { trigger.disabled = false; trigger.classList.remove('is-loading'); });
      toast('No pudimos cargar los filtros. Intenta nuevamente.', 'error');
      throw error;
    });
    await setupPromise;
    if (open) panel.open();
    return panel;
  }

  function clearFilters() {
    Object.assign(state, { page: 0, category: [], team: [], brand: [], color: [], size: [], minPrice: '', maxPrice: '', availability: '', promotionOnly: '' });
    writeHomeUrl(state);
    panel.setApplied(state);
    renderResults();
  }

  function clearEverything() {
    Object.assign(state, { q: '', page: 0, sort: 'relevance', category: [], team: [], brand: [], color: [], size: [], minPrice: '', maxPrice: '', availability: '', promotionOnly: '' });
    sortSelect.value = 'relevance';
    writeHomeUrl(state);
    panel?.setApplied(state);
    renderResults();
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  async function activateQuery(value) {
    state.q = String(value || '').trim().replace(/\s+/g, ' ');
    state.page = 0;
    if (state.q || homeFilterCount(state)) await ensurePanel();
    writeHomeUrl(state);
    panel?.setApplied(state);
    renderResults();
  }

  const firstOpen = async event => {
    if (panel) return;
    event.preventDefault();
    try { await ensurePanel({ open: true }); }
    catch (error) { console.error(error); }
  };
  triggers.forEach(trigger => trigger.addEventListener('click', firstOpen));
  window.addEventListener('home:search', event => activateQuery(event.detail?.query).catch(error => console.error(error)));
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; state.page = 0; writeHomeUrl(state); renderResults(); });
  $('#home-load-more').addEventListener('click', () => { state.page += 1; renderResults(); });
  $('#home-clear-results').addEventListener('click', clearEverything);
  addEventListener('popstate', async () => {
    const current = params();
    Object.assign(state, {
      q: current.get('q')?.trim().replace(/\s+/g, ' ') || '', page: 0, sort: current.get('sort') || 'relevance',
      category: readFilterList(current, 'category'), team: readFilterList(current, 'team'), brand: readFilterList(current, 'brand'),
      color: readFilterList(current, 'color'), size: readFilterList(current, 'size'), minPrice: current.get('min') || '',
      maxPrice: current.get('max') || '', availability: current.get('availability') || '', promotionOnly: current.get('promotion') || ''
    });
    sortSelect.value = state.sort;
    if (state.q || homeFilterCount(state)) await ensurePanel();
    panel?.setApplied(state);
    renderResults();
  });

  updateFilterTriggers();
  syncSearchInputs();
  if (state.q || homeFilterCount(state)) {
    await ensurePanel();
    panel.setApplied(state);
    renderResults();
  }
}

function isAvailable(product) {
  return !product.force_sold_out && (product.product_variants || []).some(variant => variant.active && Number(variant.stock) > 0);
}

function categoryQuickItem(category) {
  const visual = category.image_url
    ? `<img src="${localAsset(category.image_url)}" alt="" loading="eager">`
    : `<span>${escapeHtml(categoryInitials(category.name))}</span>`;
  return `<a class="quick-category" href="${getCategoryUrl(category.slug)}"><i>${visual}</i><strong>${escapeHtml(category.name.replace('Uniformes de fútbol ', 'Uniformes '))}</strong></a>`;
}

function teamTypeLabel(type) {
  return { club: 'Club', national_team: 'Selección', colombian_team: 'Club colombiano' }[type] || 'Equipo';
}

function teamCard(team, { directory = false, eager = false } = {}) {
  const initials = team.name.split(/\s+/).map(word => word[0]).join('').slice(0, 3).toUpperCase();
  const crest = team.crest_url
    ? `<span class="team-crest"><img src="${localAsset(team.crest_url)}" alt="Escudo de ${escapeHtml(team.name)}" width="88" height="88" loading="${eager ? 'eager' : 'lazy'}" decoding="async" data-team-crest-image data-team-initials="${escapeHtml(initials)}"></span>`
    : `<span class="team-crest team-crest--fallback" aria-hidden="true">${escapeHtml(initials)}</span>`;
  if (!directory) return `<a class="team-card" href="${getTeamUrl(team.slug)}" aria-label="Ver productos de ${escapeHtml(team.name)}">${crest}<strong>${escapeHtml(team.name)}</strong><small>Ver productos</small></a>`;
  const productCount = Number.isFinite(team.productCount)
    ? `${team.productCount} producto${team.productCount === 1 ? '' : 's'}`
    : 'Ver productos';
  return `<a class="team-card team-card--directory" href="${getTeamUrl(team.slug)}" aria-label="Ver productos de ${escapeHtml(team.name)}">
    ${crest}
    <span class="team-card__body">
      <small class="team-card__type">${escapeHtml(teamTypeLabel(team.type))}</small>
      <strong>${escapeHtml(team.name)}</strong>
      <span class="team-card__action">${escapeHtml(productCount)} <b aria-hidden="true">→</b></span>
    </span>
  </a>`;
}

export async function initCatalog() {
  const url = params();
  const state = {
    page: 0,
    sort: url.get('sort') || (url.get('q') ? 'relevance' : 'featured'),
    q: url.get('q') || '',
    category: url.get('category') || '', team: url.get('team') || '', brand: url.get('brand') || '',
    color: url.get('color') || '', size: url.get('size') || '', minPrice: url.get('min') || '', maxPrice: url.get('max') || '',
    availability: url.get('availability') || '', promotion: url.get('promotion') || ''
  };
  const [categories, teams, brands, options] = await Promise.all([getCategories(), getTeams(), getBrands(), getFilterOptions()]);
  $('#sort-select').value = state.sort;
  if (state.q) { $('#catalog-title').textContent = `Resultados para “${state.q}”`; $('#catalog-description').textContent = 'Coincidencias en productos, equipos, marcas, categorías, colores y materiales.'; }
  else {
    const context = teams.find(item => item.slug === state.team) || categories.find(item => item.slug === state.category) || brands.find(item => item.slug === state.brand);
    if (context) {
      $('#catalog-title').textContent = context.name;
      $('#catalog-description').textContent = `Explora todos los productos disponibles de ${context.name} y afina el resultado con los filtros.`;
      document.title = `${context.name} | Fuera de Lugar Sport`;
    }
  }
  $('#filters').innerHTML = filterMarkup(categories, teams, brands, options, state);
  bindFilters(state, { categories, teams, brands });
  let loaded = [];

  async function load(reset = false) {
    if (reset) { state.page = 0; loaded = []; }
    $('#catalog-products').classList.add('skeleton-grid');
    let ids;
    if (state.q) ids = (await searchProducts(state.q, 50)).map(item => item.id);
    const categoryId = categories.find(item => item.slug === state.category)?.id;
    const teamId = teams.find(item => item.slug === state.team)?.id;
    const brandId = brands.find(item => item.slug === state.brand)?.id;
    const result = await getProducts({ page: state.page, pageSize: PAGE_SIZE, sort: state.sort, categoryId, teamId, brandId, color: state.color, size: state.size, minPrice: state.minPrice, maxPrice: state.maxPrice, availability: state.availability, promotion: state.promotion === 'true', ids });
    loaded = [...loaded, ...result.products];
    if (state.sort === 'discount') loaded.sort((a, b) => discountPercent(b) - discountPercent(a));
    const root = $('#catalog-products');
    root.classList.remove('skeleton-grid');
    if (loaded.length) renderProducts(root, loaded);
    else root.innerHTML = emptyState('No encontramos productos', 'Prueba quitando algún filtro o revisando tu búsqueda.');
    $('#result-count').textContent = `${result.count ?? loaded.length} producto${(result.count ?? loaded.length) === 1 ? '' : 's'}`;
    $('#load-more').hidden = loaded.length >= (result.count ?? loaded.length) || result.products.length < PAGE_SIZE;
    updateFilterCount(state);
  }

  $('#sort-select').addEventListener('change', event => { state.sort = event.target.value; syncCatalogUrl(state); load(true); });
  $('#load-more').addEventListener('click', () => { state.page += 1; load(); });
  $('#open-filters').addEventListener('click', () => { $('#filters').classList.add('open'); document.body.classList.add('no-scroll'); });
  $('#filters').querySelector('.filters__close').addEventListener('click', closeFilters);
  $('#filters').querySelector('.filters__apply').addEventListener('click', closeFilters);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#filters').classList.contains('open')) closeFilters(); });
  $('#clear-filters').addEventListener('click', () => {
    Object.assign(state, { category: '', team: '', brand: '', color: '', size: '', minPrice: '', maxPrice: '', availability: '', promotion: '', q: '', sort: 'featured' });
    $$('#filters input').forEach(input => { input.checked = false; if (input.type === 'number') input.value = ''; });
    $('#catalog-title').textContent = 'Catálogo'; $('#catalog-description').textContent = 'Explora productos disponibles y encuentra tu próximo favorito.'; $('#sort-select').value = 'featured'; syncCatalogUrl(state); load(true);
  });
  function closeFilters() { $('#filters').classList.remove('open'); document.body.classList.remove('no-scroll'); }
  $('#filters').addEventListener('filters:changed', () => { syncCatalogUrl(state); load(true); });
  await load(true);
}

function filterMarkup(categories, teams, brands, options, state) {
  const checks = (items, key, value = item => item.slug, label = item => item.name) => items.map(item => `<label><input type="checkbox" name="${key}" value="${escapeHtml(value(item))}" ${state[key] === value(item) ? 'checked' : ''}>${escapeHtml(label(item))}</label>`).join('');
  return `<div class="filters__head"><strong>Filtrar productos</strong><button class="filters__close" type="button" aria-label="Cerrar filtros">×</button></div>
    <div class="filter-group"><h3>Categoría</h3><div class="check-list">${checks(categories, 'category')}</div></div>
    <div class="filter-group"><h3>Equipo</h3><div class="check-list">${checks(teams, 'team')}</div></div>
    <div class="filter-group"><h3>Marca</h3><div class="check-list">${checks(brands, 'brand')}</div></div>
    <div class="filter-group"><h3>Talla</h3><div class="check-list">${checks(options.sizes.map(name => ({ name })), 'size', item => item.name)}</div></div>
    <div class="filter-group"><h3>Color</h3><div class="check-list">${checks(options.colors.map(name => ({ name })), 'color', item => item.name)}</div></div>
    <div class="filter-group"><h3>Disponibilidad</h3><div class="check-list"><label><input type="checkbox" name="availability" value="available" ${state.availability === 'available' ? 'checked' : ''}>Disponible ahora</label><label><input type="checkbox" name="promotion" value="true" ${state.promotion === 'true' ? 'checked' : ''}>En promoción</label></div></div>
    <div class="filter-group"><h3>Precio</h3><div class="price-inputs"><label>Mínimo<input type="number" name="minPrice" min="0" step="1000" value="${escapeHtml(state.minPrice)}"></label><label>Máximo<input type="number" name="maxPrice" min="0" step="1000" value="${escapeHtml(state.maxPrice)}"></label></div></div>
    <div class="filters__apply"><button class="btn btn--primary btn--block" type="button">Ver resultados</button></div>`;
}

function bindFilters(state) {
  $('#filters').addEventListener('change', event => {
    const input = event.target;
    if (!input.name) return;
    if (input.type === 'checkbox') {
      $$(`input[name="${input.name}"]`, $('#filters')).forEach(other => { if (other !== input) other.checked = false; });
      state[input.name] = input.checked ? input.value : '';
    } else state[input.name] = input.value;
    $('#filters').dispatchEvent(new CustomEvent('filters:changed'));
  });
}

function updateFilterCount(state) {
  const count = ['category','team','brand','color','size','minPrice','maxPrice','availability','promotion'].filter(key => state[key]).length;
  $('#filter-count').textContent = count ? `(${count})` : '';
}

function syncCatalogUrl(state) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) if (value && key !== 'page' && !(key === 'sort' && value === 'featured')) next.set(key === 'minPrice' ? 'min' : key === 'maxPrice' ? 'max' : key, value);
  history.replaceState(null, '', `${location.pathname}${next.size ? `?${next}` : ''}`);
}

function teamListingState(query = params()) {
  const validSorts = ['relevance', 'newest', 'price-asc', 'price-desc', 'discount', 'name'];
  const sort = query.get('sort') || 'relevance';
  return {
    page: 0,
    sort: validSorts.includes(sort) ? sort : 'relevance',
    category: readFilterList(query, 'category'),
    brand: readFilterList(query, 'brand'),
    color: readFilterList(query, 'color'),
    size: readFilterList(query, 'size'),
    minPrice: query.get('min') || '',
    maxPrice: query.get('max') || '',
    availability: query.get('availability') || '',
    promotionOnly: query.get('promotion') || ''
  };
}

function activeTeamFilterCount(state) {
  return ['category', 'brand', 'color', 'size'].reduce((count, key) => count + (state[key]?.length || 0), 0)
    + Number(Boolean(state.minPrice || state.maxPrice))
    + Number(Boolean(state.availability))
    + Number(Boolean(state.promotionOnly));
}

function writeTeamListingUrl(slug, state, replace = false) {
  const query = new URLSearchParams({ slug });
  const names = { minPrice: 'min', maxPrice: 'max', promotionOnly: 'promotion' };
  for (const [key, value] of Object.entries(state)) {
    const serialized = Array.isArray(value) ? value.join(',') : value;
    if (serialized && key !== 'page' && key !== 'slug' && !(key === 'sort' && serialized === 'relevance')) query.set(names[key] || key, serialized);
  }
  history[replace ? 'replaceState' : 'pushState'](null, '', `${location.pathname}?${query}${location.hash}`);
}

function teamInitials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map(word => word[0]).join('') : name.slice(0, 2)).toUpperCase() || 'FDL';
}

function renderTeamNotFound() {
  document.title = 'Equipo no encontrado | Fuera de Lugar Sport';
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = 'El equipo que buscas no está disponible.';
  const main = $('#main');
  main.innerHTML = `<nav class="breadcrumbs team-breadcrumbs" aria-label="Migas de pan"><a href="index.html">Inicio</a><span aria-hidden="true">›</span><a href="equipos.html">Equipos</a><span aria-hidden="true">›</span><span aria-current="page">No encontrado</span></nav>
    <div class="empty-state team-not-found"><span class="empty-state__icon" aria-hidden="true">?</span><h1>Equipo no encontrado</h1><p>Puede que el enlace haya cambiado o que este equipo ya no esté disponible.</p><div class="empty-state__actions"><a class="btn btn--primary" href="equipos.html">Ver equipos</a><a class="btn btn--ghost" href="index.html">Ir al inicio</a></div></div>`;
}

async function initTeamListing(slug) {
  const root = $('#listing-products');
  renderProductSkeletons(root, 10);
  let entity;
  try { entity = await getEntityBySlug('team', slug); }
  catch (error) {
    if (error?.message === 'Listado no encontrado') { renderTeamNotFound(); return; }
    throw error;
  }
  if (entity.active === false) { renderTeamNotFound(); return; }

  const state = teamListingState();
  const sortSelect = $('#team-sort-select');
  const shareButton = $('#share-listing');
  const initials = teamInitials(entity.name);
  const typeLabel = teamTypeLabel(entity.type);
  let loaded = [];
  let baseProductCount = null;
  let panel;

  $('#listing-title').textContent = entity.name;
  $('#listing-description').textContent = entity.description || `Encuentra todos los productos disponibles de ${entity.name}.`;
  $('#team-meta').textContent = typeLabel;
  $('#team-collection-header').setAttribute('aria-busy', 'false');
  const crestRoot = $('#team-crest');
  crestRoot.className = `team-collection-crest team-crest${entity.crest_url ? '' : ' team-crest--fallback'}`;
  crestRoot.removeAttribute('aria-hidden');
  crestRoot.innerHTML = entity.crest_url
    ? `<img src="${localAsset(entity.crest_url)}" alt="Escudo de ${escapeHtml(entity.name)}" width="80" height="80" loading="eager" decoding="async" data-team-crest-image data-team-initials="${escapeHtml(initials)}">`
    : `<span aria-hidden="true">${escapeHtml(initials)}</span>`;
  $('#breadcrumbs').innerHTML = `<a href="index.html">Inicio</a><span aria-hidden="true">›</span><a href="equipos.html">Equipos</a><span aria-hidden="true">›</span><span aria-current="page">${escapeHtml(entity.name)}</span>`;
  document.title = `${entity.name} | Fuera de Lugar Sport`;
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) metaDescription.content = `Encuentra uniformes, camisetas y productos disponibles de ${entity.name} en Fuera de Lugar Sport.`;
  shareButton.setAttribute('aria-label', `Compartir productos de ${entity.name}`);
  sortSelect.value = state.sort;

  const [categories, brands, options] = await Promise.all([getCategories(), getBrands(), getFilterOptions()]);
  const sections = buildProductFilterSections({ categories, teams: [], brands, options, context: 'team' });

  function selectedCategoryIds() {
    const selected = categories.filter(category => state.category.includes(category.slug));
    const ids = new Set(selected.map(category => category.id));
    categories.forEach(category => { if (selected.some(parent => category.parent_id === parent.id)) ids.add(category.id); });
    return [...ids];
  }

  function updateTeamChrome(resultCount) {
    const count = activeTeamFilterCount(state);
    const filterCount = $('#team-filter-count');
    filterCount.textContent = count;
    filterCount.hidden = !count;
    $('#open-team-filters').classList.toggle('is-active', Boolean(count));
    $('#team-result-count').textContent = `${resultCount} producto${resultCount === 1 ? '' : 's'}`;
    if (baseProductCount != null) $('#team-meta').textContent = `${typeLabel} · ${baseProductCount} producto${baseProductCount === 1 ? '' : 's'}`;
  }

  async function load(reset = false) {
    if (reset) {
      state.page = 0;
      loaded = [];
      renderProductSkeletons(root, 10);
    }
    const categoryIds = selectedCategoryIds();
    const brandIds = brands.filter(brand => state.brand.includes(brand.slug)).map(brand => brand.id);
    const queryOptions = {
      teamId: entity.id,
      categoryId: categoryIds.length ? categoryIds : undefined,
      brandId: brandIds.length ? brandIds : undefined,
      color: state.color.length ? state.color : undefined,
      size: state.size.length ? state.size : undefined,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      availability: state.availability,
      promotion: state.promotionOnly === 'true'
    };
    let result;
    if (state.sort === 'discount') {
      const orderedIds = await getDiscountSortedProductIds(queryOptions);
      const visibleIds = orderedIds.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
      const pageResult = visibleIds.length
        ? await getProducts({ ids: visibleIds, pageSize: PAGE_SIZE, sort: 'relevance' })
        : { products: [] };
      result = { products: pageResult.products, count: orderedIds.length };
    } else {
      result = await getProducts({ ...queryOptions, page: state.page, pageSize: PAGE_SIZE, sort: state.sort });
    }
    loaded = reset ? result.products : [...loaded, ...result.products];
    const total = result.count ?? loaded.length;
    if (baseProductCount == null && !activeTeamFilterCount(state)) baseProductCount = total;
    if (loaded.length) renderProducts(root, loaded, { hideTeamLabel: true });
    else if (activeTeamFilterCount(state)) {
      root.classList.remove('skeleton-grid', 'is-loading');
      root.setAttribute('aria-busy', 'false');
      root.innerHTML = `<div class="empty-state team-filter-empty"><span class="empty-state__icon" aria-hidden="true">⌕</span><h2>No encontramos productos de ${escapeHtml(entity.name)} con estos filtros</h2><p>Prueba quitando uno de los filtros seleccionados.</p><button id="empty-clear-team-filters" class="btn btn--primary" type="button">Limpiar filtros</button></div>`;
      $('#empty-clear-team-filters').addEventListener('click', clearAllFilters);
    } else {
      root.classList.remove('skeleton-grid', 'is-loading');
      root.setAttribute('aria-busy', 'false');
      root.innerHTML = `<div class="empty-state team-filter-empty"><span class="empty-state__icon" aria-hidden="true">○</span><h2>Por ahora no tenemos productos disponibles de ${escapeHtml(entity.name)}</h2><p>Explora otros equipos o descubre el catálogo completo.</p><div class="empty-state__actions"><a class="btn btn--primary" href="equipos.html">Ver otros equipos</a><a class="btn btn--ghost" href="catalogo.html">Explorar catálogo</a></div></div>`;
    }
    $('#load-more').hidden = loaded.length >= total || result.products.length < PAGE_SIZE;
    updateTeamChrome(total);
  }

  async function clearAllFilters() {
    Object.assign(state, { page: 0, category: [], brand: [], color: [], size: [], minPrice: '', maxPrice: '', availability: '', promotionOnly: '' });
    writeTeamListingUrl(entity.slug, state);
    panel.setApplied(state);
    await load(true);
    toast('Mostrando todos los productos');
  }

  panel = createFilterPanel({
    root: $('#team-filters'),
    trigger: $('#open-team-filters'),
    chipsRoot: $('#team-active-filters'),
    title: `Filtrar ${entity.name}`,
    sections,
    initialState: state,
    getResultCount: () => null,
    onApply: async next => {
      Object.assign(state, next, { page: 0 });
      writeTeamListingUrl(entity.slug, state);
      await load(true);
      toast(activeTeamFilterCount(state) ? 'Filtros aplicados' : 'Mostrando todos los productos');
    },
    onRemove: async (key, value) => {
      if (key === 'price') { state.minPrice = ''; state.maxPrice = ''; }
      else if (Array.isArray(state[key])) state[key] = state[key].filter(item => item !== value);
      else state[key] = '';
      state.page = 0;
      writeTeamListingUrl(entity.slug, state);
      panel.setApplied(state);
      await load(true);
    },
    onClear: clearAllFilters,
    resultNoun: { singular: 'producto', plural: 'productos' },
    desktopMode: 'drawer'
  });

  $('#team-filter-backdrop').addEventListener('click', () => panel.close());
  $('#load-more').addEventListener('click', async event => { state.page += 1; await load(); event.currentTarget.focus(); });
  sortSelect.addEventListener('change', async event => {
    state.sort = event.target.value;
    state.page = 0;
    writeTeamListingUrl(entity.slug, state);
    await load(true);
  });
  shareButton.addEventListener('click', async () => {
    try {
      const shareUrl = new URL(location.href);
      shareUrl.search = new URLSearchParams({ slug: entity.slug });
      const result = await sharePage({
        title: `${entity.name} | Fuera de Lugar Sport`,
        text: `Mira los productos disponibles de ${entity.name} en Fuera de Lugar Sport.`,
        url: shareUrl.href
      });
      if (result === 'copied') toast('Enlace copiado');
    } catch (error) {
      console.error(error);
      toast('No pudimos compartir el enlace', 'error');
    }
  });
  addEventListener('popstate', async () => {
    Object.assign(state, teamListingState());
    sortSelect.value = state.sort;
    panel.setApplied(state);
    await load(true);
  });

  if (activeTeamFilterCount(state)) {
    const base = await getProducts({ teamId: entity.id, pageSize: 1, sort: 'relevance' });
    baseProductCount = base.count ?? 0;
  }
  await load(true);
}

export async function initListing() {
  const type = document.body.dataset.listingType;
  const slug = routeSlug();
  if (type === 'team') {
    if (!slug) { renderTeamNotFound(); return; }
    await initTeamListing(slug);
    return;
  }
  if (!slug) throw new Error('Falta slug');
  const [entity, categories] = await Promise.all([getEntityBySlug(type, slug), type === 'category' ? getCategories() : Promise.resolve([])]);
  $('#listing-title').textContent = entity.name;
  $('#listing-description').textContent = entity.description || `Todos los productos disponibles de ${entity.name}.`;
  document.title = `${entity.name} | Fuera de Lugar Sport`;
  $('#breadcrumbs').innerHTML = `<a href="index.html">Inicio</a><span>›</span><a href="${type === 'team' ? 'equipos.html' : type === 'category' ? 'categorias.html' : 'catalogo.html'}">${type === 'team' ? 'Equipos' : type === 'category' ? 'Categorías' : 'Marcas'}</a><span>›</span><span>${escapeHtml(entity.name)}</span>`;
  const shareButton = $('#share-listing');
  shareButton.insertAdjacentHTML('beforebegin', `<a class="btn btn--primary" href="catalogo.html?${type}=${encodeURIComponent(entity.slug)}">Usar filtros</a>`);
  const children = type === 'category' ? categories.filter(item => item.parent_id === entity.id) : [];
  if ($('#subcategories')) $('#subcategories').innerHTML = children.map(child => `<a class="chip" href="${getCategoryUrl(child.slug)}">${escapeHtml(child.name)}</a>`).join('');
  const filters = type === 'category' ? { categoryId: [entity.id, ...children.map(item => item.id)] } : type === 'team' ? { teamId: entity.id } : { brandId: entity.id };
  const { products } = await getProducts({ ...filters, pageSize: 50 });
  const root = $('#listing-products'); root.classList.remove('skeleton-grid');
  if (products.length) renderProducts(root, products); else root.innerHTML = emptyState('Todavía no hay productos aquí', 'Explora el catálogo completo mientras agregamos novedades.');
  shareButton.addEventListener('click', async () => { const result = await sharePage({ title: document.title, text: `Mira ${entity.name} en Fuera de Lugar Sport` }); if (result === 'copied') toast('Enlace copiado'); });
}

function readFilterList(query, key) {
  return (query.get(key) || '').split(',').map(value => value.trim()).filter(Boolean);
}

function writePromotionsUrl(state, replace = false) {
  const query = new URLSearchParams();
  const names = { minPrice: 'min', maxPrice: 'max', minDiscount: 'discount' };
  for (const [key, value] of Object.entries(state)) {
    const serialized = Array.isArray(value) ? value.join(',') : value;
    if (serialized && key !== 'page' && !(key === 'sort' && serialized === 'commercial')) query.set(names[key] || key, serialized);
  }
  history[replace ? 'replaceState' : 'pushState'](null, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
}

export async function initPromotions() {
  const query = params();
  const state = {
    page: 0,
    sort: query.get('sort') || 'commercial',
    category: readFilterList(query, 'category'),
    team: readFilterList(query, 'team'),
    brand: readFilterList(query, 'brand'),
    color: readFilterList(query, 'color'),
    size: readFilterList(query, 'size'),
    minPrice: query.get('min') || '',
    maxPrice: query.get('max') || '',
    availability: query.get('availability') || '',
    minDiscount: query.get('discount') || ''
  };
  const productRoot = $('#promotion-products');
  renderProductSkeletons(productRoot);
  const [categories, teams, brands, options, result] = await Promise.all([
    getCategories(), getTeams(), getBrands(), getFilterOptions(),
    getProducts({ pageSize: 1000, promotion: true, sort: 'commercial' })
  ]);
  const promotionPool = [...result.products];
  for (let page = 1; promotionPool.length < (result.count || 0); page += 1) {
    const next = await getProducts({ page, pageSize: 1000, promotion: true, sort: 'commercial' });
    promotionPool.push(...next.products);
    if (!next.products.length) break;
  }
  const sortSelect = $('#promo-sort-select');
  if ([...sortSelect.options].some(option => option.value === state.sort)) sortSelect.value = state.sort;
  else state.sort = 'commercial';

  const sections = buildProductFilterSections({ categories, teams, brands, options, context: 'promotions' });

  const getMatches = candidate => promotionPool.filter(product => {
    const productCategories = (product.product_categories || []).map(item => item.categories?.slug).filter(Boolean);
    const productColors = (product.product_colors || []).map(item => item.name);
    const productSizes = (product.product_sizes || []).map(item => item.name);
    const price = currentPrice(product);
    return (!candidate.category.length || candidate.category.some(value => productCategories.includes(value)))
      && (!candidate.team.length || candidate.team.includes(product.teams?.slug))
      && (!candidate.brand.length || candidate.brand.includes(product.brands?.slug))
      && (!candidate.color.length || candidate.color.some(value => productColors.includes(value)))
      && (!candidate.size.length || candidate.size.some(value => productSizes.includes(value)))
      && (candidate.availability !== 'available' || isAvailable(product))
      && (!candidate.minDiscount || discountPercent(product) >= Number(candidate.minDiscount))
      && (!candidate.minPrice || price >= Number(candidate.minPrice))
      && (!candidate.maxPrice || price <= Number(candidate.maxPrice));
  });

  let panel;
  function renderResults() {
    const matches = getMatches(state).sort((a, b) => comparePromotions(a, b, state.sort));
    const visible = matches.slice(0, (state.page + 1) * PAGE_SIZE);
    productRoot.classList.remove('skeleton-grid', 'is-loading');
    productRoot.setAttribute('aria-busy', 'false');
    if (visible.length) renderProducts(productRoot, visible);
    else if (activePromotionFilterCount(state)) productRoot.innerHTML = `<div class="empty-state"><span class="empty-state__icon" aria-hidden="true">%</span><h2>No encontramos promociones</h2><p>Prueba quitando uno de los filtros activos.</p><button class="btn btn--primary" id="empty-clear-promo-filters" type="button">Limpiar filtros</button></div>`;
    else productRoot.innerHTML = emptyState('Por ahora no tenemos promociones activas', 'Explora el catálogo mientras llegan nuevas ofertas.', 'catalogo.html', 'Explorar catálogo', '%');
    $('#promotion-result-count').textContent = `${matches.length} oferta${matches.length === 1 ? '' : 's'} encontrada${matches.length === 1 ? '' : 's'}`;
    $('#load-more-promos').hidden = visible.length >= matches.length;
    updatePromotionFilterCount(state);
    $('#empty-clear-promo-filters')?.addEventListener('click', clearAllFilters);
  }

  function clearAllFilters() {
    Object.assign(state, { page: 0, category: [], team: [], brand: [], color: [], size: [], minPrice: '', maxPrice: '', availability: '', minDiscount: '' });
    writePromotionsUrl(state);
    panel.setApplied(state);
    renderResults();
  }

  panel = createFilterPanel({
    root: $('#promotion-filters'),
    trigger: $('#open-promo-filters'),
    chipsRoot: $('#promo-active-filters'),
    title: 'Filtrar promociones',
    sections,
    initialState: state,
    getResultCount: draft => getMatches(draft).length,
    onApply: async next => {
      Object.assign(state, next, { page: 0 });
      writePromotionsUrl(state);
      renderResults();
      toast(activePromotionFilterCount(state) ? 'Filtros aplicados' : 'Mostrando todas las ofertas');
    },
    onRemove: async (key, value) => {
      if (key === 'price') { state.minPrice = ''; state.maxPrice = ''; }
      else if (Array.isArray(state[key])) state[key] = state[key].filter(item => item !== value);
      else state[key] = '';
      state.page = 0;
      writePromotionsUrl(state);
      panel.setApplied(state);
      renderResults();
    },
    onClear: clearAllFilters
  });

  $('#promo-filter-backdrop').addEventListener('click', () => panel.close());
  $('#clear-promo-filters').addEventListener('click', clearAllFilters);
  $('#load-more-promos').addEventListener('click', event => { state.page += 1; renderResults(); event.currentTarget.focus(); });
  sortSelect.addEventListener('change', event => {
    state.sort = event.target.value;
    state.page = 0;
    writePromotionsUrl(state);
    renderResults();
  });
  addEventListener('popstate', () => {
    const current = params();
    Object.assign(state, {
      page: 0,
      sort: current.get('sort') || 'commercial',
      category: readFilterList(current, 'category'),
      team: readFilterList(current, 'team'),
      brand: readFilterList(current, 'brand'),
      color: readFilterList(current, 'color'),
      size: readFilterList(current, 'size'),
      minPrice: current.get('min') || '',
      maxPrice: current.get('max') || '',
      availability: current.get('availability') || '',
      minDiscount: current.get('discount') || ''
    });
    sortSelect.value = state.sort;
    panel.setApplied(state);
    renderResults();
  });
  $('#share-promos').addEventListener('click', async () => {
    try { if (await sharePage({ text: 'Mira las promociones de Fuera de Lugar Sport' }) === 'copied') toast('Enlace copiado'); }
    catch (error) { console.error(error); toast('No pudimos copiar el enlace', 'error'); }
  });
  renderResults();
}

function activePromotionFilterCount(state) {
  return ['category','team','brand','color','size'].reduce((count, key) => count + (Array.isArray(state[key]) ? state[key].length : Number(Boolean(state[key]))), 0)
    + Number(Boolean(state.minPrice || state.maxPrice))
    + Number(Boolean(state.availability))
    + Number(Boolean(state.minDiscount));
}

function updatePromotionFilterCount(state) {
  const count = activePromotionFilterCount(state);
  $('#promo-filter-count').textContent = count ? `(${count})` : '';
  $('#clear-promo-filters').hidden = !count;
}

function comparePromotions(a, b, sort) {
  if (sort === 'discount') return discountPercent(b) - discountPercent(a);
  if (sort === 'price-asc') return currentPrice(a) - currentPrice(b);
  if (sort === 'price-desc') return currentPrice(b) - currentPrice(a);
  if (sort === 'name') return a.name.localeCompare(b.name, 'es');
  if (sort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
  return Number(isAvailable(b)) - Number(isAvailable(a)) || Number(b.featured) - Number(a.featured) || discountPercent(b) - discountPercent(a) || new Date(b.created_at) - new Date(a.created_at);
}

export async function initTeams() {
  const labels = { all: 'Todos', club: 'Clubes', national_team: 'Selecciones', colombian_team: 'Colombianos' };
  const query = params();
  const initialType = query.get('type');
  const state = {
    search: query.get('search')?.trim().replace(/\s+/g, ' ') || '',
    type: Object.prototype.hasOwnProperty.call(labels, initialType) ? initialType : 'all',
    sort: query.get('sort') === 'desc' ? 'desc' : 'asc'
  };
  const tabs = $('#team-tabs');
  const root = $('#all-teams');
  const search = $('#team-search-input');
  const clearSearch = $('#clear-team-search');
  const clearAll = $('#clear-team-filters');
  const sort = $('#team-sort-select');
  const count = $('#team-result-count');
  let teams = [];

  tabs.innerHTML = Object.entries(labels).map(([value, label]) => `<button class="tab${value === state.type ? ' active' : ''}" data-type="${value}" type="button" aria-pressed="${value === state.type}">${label}</button>`).join('');
  search.value = state.search;
  sort.value = state.sort;

  function syncUrl() {
    const next = new URLSearchParams();
    if (state.type !== 'all') next.set('type', state.type);
    if (state.search) next.set('search', state.search);
    if (state.sort === 'desc') next.set('sort', 'desc');
    history.replaceState(history.state, '', `${location.pathname}${next.size ? `?${next}` : ''}`);
  }

  function updateControls() {
    $$('.tab', tabs).forEach(tab => {
      const active = tab.dataset.type === state.type;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    clearSearch.hidden = !search.value;
    clearAll.hidden = !state.search && state.type === 'all' && state.sort === 'asc';
  }

  function matchesSearch(team) {
    if (!state.search) return true;
    const typeTerms = {
      club: 'club clubes',
      national_team: 'seleccion selecciones nacional',
      colombian_team: 'club clubes colombiano colombianos colombia'
    }[team.type] || '';
    const haystack = normalizeText(`${team.name} ${team.type} ${typeTerms}`);
    return normalizeText(state.search).split(' ').filter(Boolean).every(word => haystack.includes(word));
  }

  function emptyTeamsMarkup() {
    if (!teams.length) return emptyState('No hay equipos disponibles por ahora', 'Explora el catálogo para encontrar todos nuestros productos.', 'catalogo.html', 'Explorar catálogo');
    if (state.search) return `<div class="empty-state team-empty"><span class="empty-state__icon" aria-hidden="true">⌕</span><h2>No encontramos equipos para “${escapeHtml(state.search)}”</h2><p>Prueba con otro nombre o limpia la búsqueda.</p><button class="btn btn--primary" type="button" data-clear-team-search>Limpiar búsqueda</button></div>`;
    return `<div class="empty-state team-empty"><span class="empty-state__icon" aria-hidden="true">⚽</span><h2>No hay equipos disponibles en esta sección</h2><p>Prueba viendo todos los clubes y selecciones.</p><button class="btn btn--primary" type="button" data-show-all-teams>Mostrar todos</button></div>`;
  }

  function render() {
    const direction = state.sort === 'desc' ? -1 : 1;
    const filtered = teams
      .filter(team => (state.type === 'all' || team.type === state.type) && matchesSearch(team))
      .sort((a, b) => direction * a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    root.classList.remove('is-loading');
    root.setAttribute('aria-busy', 'false');
    root.innerHTML = filtered.length
      ? filtered.map((team, index) => teamCard(team, { directory: true, eager: index < 6 })).join('')
      : emptyTeamsMarkup();
    count.textContent = `${filtered.length} ${state.search || state.type !== 'all' ? 'resultado' : 'equipo'}${filtered.length === 1 ? '' : 's'}`;
    updateControls();
    syncUrl();
  }

  function resetSearch() {
    search.value = '';
    state.search = '';
    render();
    search.focus();
  }

  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-type]');
    if (!button || button.dataset.type === state.type) return;
    state.type = button.dataset.type;
    render();
    button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });
  search.addEventListener('input', () => {
    clearSearch.hidden = !search.value;
    debouncedSearch();
  });
  const debouncedSearch = debounce(() => {
    state.search = search.value.trim().replace(/\s+/g, ' ');
    render();
  }, 220);
  clearSearch.addEventListener('click', resetSearch);
  clearAll.addEventListener('click', () => {
    search.value = '';
    Object.assign(state, { search: '', type: 'all', sort: 'asc' });
    sort.value = 'asc';
    render();
  });
  sort.addEventListener('change', () => { state.sort = sort.value; render(); });
  root.addEventListener('click', event => {
    if (event.target.closest('[data-clear-team-search]')) resetSearch();
    if (event.target.closest('[data-show-all-teams]')) { state.type = 'all'; render(); }
  });

  const [activeTeams, productCounts] = await Promise.all([
    getTeams(),
    getPublishedProductCountsByTeam().catch(error => {
      console.warn('No fue posible cargar los conteos de productos por equipo:', error);
      return null;
    })
  ]);
  teams = activeTeams
    .filter(team => !productCounts || productCounts[team.id] > 0)
    .map(team => ({ ...team, productCount: productCounts ? productCounts[team.id] : undefined }));
  render();
}

export async function initFavorites() {
  let ids = getFavorites();
  const root = $('#favorite-products');
  const count = $('#favorite-count');
  const sort = $('#favorite-sort-select');
  let products = [];

  function render() {
    const ordered = [...products].sort((a, b) => compareFavorites(a, b, sort.value, ids));
    count.textContent = `${ordered.length} producto${ordered.length === 1 ? '' : 's'} guardado${ordered.length === 1 ? '' : 's'}`;
    if (ordered.length) renderProducts(root, ordered);
    else {
      root.classList.remove('skeleton-grid', 'is-loading');
      root.setAttribute('aria-busy', 'false');
      root.innerHTML = emptyState('Todavía no tienes favoritos', 'Guarda productos con el corazón para encontrarlos fácilmente después.', 'catalogo.html', 'Explorar productos', '♡');
    }
    sort.disabled = !ordered.length;
  }

  root.addEventListener('favorite:toggled', event => {
    if (event.detail.active) return;
    const card = event.target.closest('.product-card');
    card?.classList.add('is-removing');
    ids = ids.filter(id => id !== event.detail.id);
    setTimeout(() => {
      products = products.filter(product => product.id !== event.detail.id);
      render();
    }, 210);
  });
  sort.addEventListener('change', render);
  if (!ids.length) { render(); return; }
  renderProductSkeletons(root);
  products = await getProductsByIds(ids);
  const validIds = ids.filter(id => products.some(product => product.id === id));
  if (validIds.length !== ids.length) {
    ids = validIds;
    setFavorites(validIds);
  }
  render();
}

function compareFavorites(a, b, sort, ids) {
  if (sort === 'price-asc') return currentPrice(a) - currentPrice(b);
  if (sort === 'price-desc') return currentPrice(b) - currentPrice(a);
  if (sort === 'name') return a.name.localeCompare(b.name, 'es');
  if (sort === 'discount') return discountPercent(b) - discountPercent(a);
  return ids.indexOf(b.id) - ids.indexOf(a.id);
}
