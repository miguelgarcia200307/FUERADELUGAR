import { getBrands, getCategories, getEntityBySlug, getFilterOptions, getProducts, getProductsByIds, getTeams, searchProducts } from '../lib/api.js';
import { loadSettings } from '../components/layout.js';
import { renderProducts, renderProductSkeletons } from '../components/product-card.js';
import { renderProductSection } from '../components/product-section.js';
import { toast } from '../components/toast.js';
import { $, $$, currentPrice, discountPercent, emptyState, escapeHtml, getCategoryUrl, localAsset, params, routeSlug, sharePage } from '../lib/helpers.js';
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
    .filter(product => product.promo_price)
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
}

function isAvailable(product) {
  return !product.force_sold_out && (product.product_variants || []).some(variant => variant.active && Number(variant.stock) > 0);
}

function categoryQuickItem(category) {
  const visual = category.image_url
    ? `<img src="${localAsset(category.image_url)}" alt="" loading="eager">`
    : `<span>${escapeHtml(category.name.slice(0, 1))}</span>`;
  return `<a class="quick-category" href="${getCategoryUrl(category.slug)}"><i>${visual}</i><strong>${escapeHtml(category.name.replace('Uniformes de fútbol ', 'Uniformes '))}</strong></a>`;
}

function teamCard(team) {
  const initials = team.name.split(/\s+/).map(word => word[0]).join('').slice(0, 3).toUpperCase();
  return `<a class="team-card" href="catalogo.html?team=${encodeURIComponent(team.slug)}">${team.crest_url ? `<span class="team-crest"><img src="${localAsset(team.crest_url)}" alt="Escudo ${escapeHtml(team.name)}" loading="lazy"></span>` : `<span class="team-crest team-crest--fallback">${escapeHtml(initials)}</span>`}<strong>${escapeHtml(team.name)}</strong><small>Ver productos</small></a>`;
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

export async function initListing() {
  const type = document.body.dataset.listingType;
  const slug = routeSlug();
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

export async function initPromotions() {
  const url = params();
  const state = {
    page: 0,
    sort: url.get('sort') || 'commercial',
    category: url.get('category') || '', team: url.get('team') || '', brand: url.get('brand') || '',
    color: url.get('color') || '', size: url.get('size') || '', minPrice: url.get('min') || '', maxPrice: url.get('max') || '',
    availability: url.get('availability') || '', minDiscount: url.get('discount') || ''
  };
  const root = $('#promotion-products');
  renderProductSkeletons(root);
  const [categories, teams, brands, options] = await Promise.all([getCategories(), getTeams(), getBrands(), getFilterOptions()]);
  const filters = $('#promotion-filters');
  filters.innerHTML = promotionFilterMarkup(categories, teams, brands, options, state);
  const sortSelect = $('#promo-sort-select');
  if ([...sortSelect.options].some(option => option.value === state.sort)) sortSelect.value = state.sort;
  else state.sort = 'commercial';
  let loaded = [];
  let fetchedCount = 0;
  let requestVersion = 0;

  async function load(reset = false) {
    const version = ++requestVersion;
    if (reset) {
      state.page = 0;
      loaded = [];
      fetchedCount = 0;
      renderProductSkeletons(root);
    }
    const categoryId = categories.find(item => item.slug === state.category)?.id;
    const teamId = teams.find(item => item.slug === state.team)?.id;
    const brandId = brands.find(item => item.slug === state.brand)?.id;
    const result = await getProducts({
      page: state.page, pageSize: PAGE_SIZE, sort: state.sort, promotion: true,
      categoryId, teamId, brandId, color: state.color, size: state.size,
      availability: state.availability
    });
    if (version !== requestVersion) return;
    fetchedCount += result.products.length;
    const minimumDiscount = Number(state.minDiscount || 0);
    const minimumPrice = Number(state.minPrice || 0);
    const maximumPrice = Number(state.maxPrice || Infinity);
    const pageProducts = result.products.filter(product => {
      const price = currentPrice(product);
      return (!minimumDiscount || discountPercent(product) >= minimumDiscount) && price >= minimumPrice && price <= maximumPrice;
    });
    loaded = [...loaded, ...pageProducts.filter(product => !loaded.some(current => current.id === product.id))];
    loaded.sort((a, b) => comparePromotions(a, b, state.sort));
    if (loaded.length) renderProducts(root, loaded);
    else {
      root.classList.remove('skeleton-grid', 'is-loading');
      root.setAttribute('aria-busy', 'false');
      root.innerHTML = emptyState('Por ahora no tenemos promociones activas', 'Explora el catálogo mientras llegan nuevas ofertas.', 'catalogo.html', 'Explorar catálogo', '%');
    }
    const hasClientPriceFilter = Boolean(state.minPrice || state.maxPrice);
    const total = minimumDiscount || hasClientPriceFilter ? loaded.length : (result.count ?? loaded.length);
    $('#promotion-result-count').textContent = `${total} oferta${total === 1 ? '' : 's'} encontrada${total === 1 ? '' : 's'}`;
    $('#load-more-promos').hidden = fetchedCount >= (result.count ?? fetchedCount) || result.products.length < PAGE_SIZE;
    updatePromotionFilterCount(state);
  }

  function closeFilters(showFeedback = false) {
    filters.classList.remove('open');
    $('#open-promo-filters').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
    if (showFeedback && activePromotionFilterCount(state)) toast('Filtros aplicados');
  }

  $('#open-promo-filters').addEventListener('click', () => {
    filters.classList.add('open');
    $('#open-promo-filters').setAttribute('aria-expanded', 'true');
    if (matchMedia('(max-width: 799px)').matches) document.body.classList.add('no-scroll');
    filters.querySelector('input,button')?.focus();
  });
  filters.querySelector('.filters__close').addEventListener('click', () => closeFilters());
  filters.querySelector('.filters__apply').addEventListener('click', () => closeFilters(true));
  filters.addEventListener('change', event => {
    const input = event.target;
    if (!input.name) return;
    if (input.type === 'checkbox') {
      $$(`input[name="${input.name}"]`, filters).forEach(other => { if (other !== input) other.checked = false; });
      state[input.name] = input.checked ? input.value : '';
    } else state[input.name] = input.value;
    syncPromotionsUrl(state);
    load(true);
  });
  sortSelect.addEventListener('change', event => { state.sort = event.target.value; syncPromotionsUrl(state); load(true); });
  $('#load-more-promos').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    state.page += 1;
    await load();
    event.currentTarget.disabled = false;
  });
  $('#clear-promo-filters').addEventListener('click', () => {
    Object.assign(state, { page: 0, sort: 'commercial', category: '', team: '', brand: '', color: '', size: '', minPrice: '', maxPrice: '', availability: '', minDiscount: '' });
    $$('input', filters).forEach(input => { input.checked = false; if (input.type === 'number') input.value = ''; });
    sortSelect.value = 'commercial';
    syncPromotionsUrl(state);
    load(true);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && filters.classList.contains('open')) closeFilters(); });
  $('#share-promos').addEventListener('click', async () => {
    try { if (await sharePage({ text: 'Mira las promociones de Fuera de Lugar Sport' }) === 'copied') toast('Enlace copiado'); }
    catch (error) { console.error(error); toast('No pudimos copiar el enlace', 'error'); }
  });
  await load(true);
}

function promotionFilterMarkup(categories, teams, brands, options, state) {
  const checks = (items, key, value = item => item.slug, label = item => item.name) => items.map(item => `<label><input type="checkbox" name="${key}" value="${escapeHtml(value(item))}" ${state[key] === value(item) ? 'checked' : ''}>${escapeHtml(label(item))}</label>`).join('');
  return `<div class="filters__head"><strong>Filtrar promociones</strong><button class="filters__close" type="button" aria-label="Cerrar filtros">×</button></div>
    <div class="filter-group"><h3>Categoría</h3><div class="check-list">${checks(categories, 'category')}</div></div>
    <div class="filter-group"><h3>Equipo</h3><div class="check-list">${checks(teams, 'team')}</div></div>
    <div class="filter-group"><h3>Marca</h3><div class="check-list">${checks(brands, 'brand')}</div></div>
    <div class="filter-group"><h3>Talla</h3><div class="check-list">${checks(options.sizes.map(name => ({ name })), 'size', item => item.name)}</div></div>
    <div class="filter-group"><h3>Color</h3><div class="check-list">${checks(options.colors.map(name => ({ name })), 'color', item => item.name)}</div></div>
    <div class="filter-group"><h3>Disponibilidad</h3><div class="check-list"><label><input type="checkbox" name="availability" value="available" ${state.availability === 'available' ? 'checked' : ''}>Disponible ahora</label></div></div>
    <div class="filter-group"><h3>Descuento</h3><div class="check-list"><label><input type="checkbox" name="minDiscount" value="10" ${state.minDiscount === '10' ? 'checked' : ''}>10% o más</label><label><input type="checkbox" name="minDiscount" value="20" ${state.minDiscount === '20' ? 'checked' : ''}>20% o más</label><label><input type="checkbox" name="minDiscount" value="30" ${state.minDiscount === '30' ? 'checked' : ''}>30% o más</label><label><input type="checkbox" name="minDiscount" value="40" ${state.minDiscount === '40' ? 'checked' : ''}>40% o más</label></div></div>
    <div class="filter-group"><h3>Precio</h3><div class="price-inputs"><label>Mínimo<input type="number" name="minPrice" min="0" step="1000" value="${escapeHtml(state.minPrice)}"></label><label>Máximo<input type="number" name="maxPrice" min="0" step="1000" value="${escapeHtml(state.maxPrice)}"></label></div></div>
    <div class="filters__apply"><button class="btn btn--primary btn--block" type="button">Ver ofertas</button></div>`;
}

function activePromotionFilterCount(state) {
  return ['category','team','brand','color','size','minPrice','maxPrice','availability','minDiscount'].filter(key => state[key]).length;
}

function updatePromotionFilterCount(state) {
  const count = activePromotionFilterCount(state);
  $('#promo-filter-count').textContent = count ? `(${count})` : '';
  $('#clear-promo-filters').hidden = !count;
}

function syncPromotionsUrl(state) {
  const next = new URLSearchParams();
  const keyMap = { minPrice: 'min', maxPrice: 'max', minDiscount: 'discount' };
  for (const [key, value] of Object.entries(state)) {
    if (value && key !== 'page' && !(key === 'sort' && value === 'commercial')) next.set(keyMap[key] || key, value);
  }
  history.replaceState(null, '', `${location.pathname}${next.size ? `?${next}` : ''}`);
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
  const teams = await getTeams();
  const labels = { all: 'Todos', club: 'Clubes', national_team: 'Selecciones', colombian_team: 'Colombianos' };
  const tabs = $('#team-tabs');
  tabs.innerHTML = Object.entries(labels).map(([value,label]) => `<button class="tab ${value === 'all' ? 'active' : ''}" data-type="${value}" role="tab" type="button">${label}</button>`).join('');
  const render = type => { const filtered = type === 'all' ? teams : teams.filter(team => team.type === type); $('#all-teams').classList.remove('skeleton-grid'); $('#all-teams').innerHTML = filtered.map(teamCard).join(''); };
  tabs.addEventListener('click', event => { const button = event.target.closest('[data-type]'); if (!button) return; $$('.tab', tabs).forEach(tab => tab.classList.toggle('active', tab === button)); render(button.dataset.type); });
  render('all');
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
