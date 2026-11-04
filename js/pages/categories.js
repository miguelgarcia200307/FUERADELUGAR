import { getCategories, getProducts, getTeams } from '../lib/api.js';
import { renderProducts } from '../components/product-card.js';
import { toast } from '../components/toast.js';
import { $, categoryIdsWithDescendants, categoryInitials, emptyState, escapeHtml, getCategoryUrl, getTeamUrl, IMAGE_FALLBACK_HANDLER, crestSrcset, localAsset, normalizeText, optimizedStorageAsset, params, routeSlug, sharePage } from '../lib/helpers.js';

const byName = (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
const CATEGORY_PAGE_SIZE = 60;

function categoryVisual(category) {
  if (category.image_url) {
    return `<img src="${escapeHtml(optimizedStorageAsset(category.image_url))}" data-original-src="${escapeHtml(localAsset(category.image_url))}" onerror="${IMAGE_FALLBACK_HANDLER}" alt="" loading="lazy" decoding="async" width="480" height="480">`;
  }
  return `<span class="category-card__fallback" aria-hidden="true"><i>${escapeHtml(categoryInitials(category.name))}</i><b></b></span>`;
}

function categoryCard(category, children) {
  const preview = children.slice(0, 3).map(item => item.name).join(' · ');
  const secondary = preview || 'Ver productos disponibles';
  return `<a class="category-card" href="${getCategoryUrl(category.slug)}">
    <span class="category-card__media">${categoryVisual(category)}</span>
    <span class="category-card__body"><strong>${escapeHtml(category.name)}</strong><small>${escapeHtml(secondary)}</small><span class="category-card__meta">${children.length ? `${children.length} secci${children.length === 1 ? 'ón' : 'ones'}` : 'Explorar'} <b aria-hidden="true">›</b></span></span>
  </a>`;
}

export async function initCategories() {
  const categories = await getCategories();
  const parents = categories.filter(item => !item.parent_id && item.slug !== 'promo').sort(byName);
  const root = $('#all-categories');
  root.classList.remove('skeleton-grid');
  if (!parents.length) {
    root.innerHTML = emptyState('Aún no hay categorías', 'Explora el catálogo completo mientras agregamos nuevas secciones.');
    return;
  }
  root.innerHTML = parents.map(parent => categoryCard(
    parent,
    categories.filter(item => item.parent_id === parent.id).sort(byName)
  )).join('');
}

export async function initCategoryListing() {
  const slug = routeSlug();
  if (!slug) throw new Error('Falta la categoría');
  const [categories, teams] = await Promise.all([getCategories(), getTeams()]);
  const requested = categories.find(item => item.slug === slug);
  if (!requested) throw new Error('Categoría no encontrada');

  const parent = requested.parent_id ? categories.find(item => item.id === requested.parent_id) || requested : requested;
  const children = categories.filter(item => item.parent_id === parent.id).sort(byName);
  const initialChild = requested.parent_id ? requested : children.find(item => item.slug === params().get('sub')) || null;

  document.title = `${parent.name} | Fuera de Lugar Sport`;
  $('#listing-title').textContent = parent.name;
  $('#listing-description').textContent = parent.description || `Encuentra productos de ${parent.name} y elige la opción ideal para ti.`;
  $('#breadcrumbs').innerHTML = `<a href="index.html">Inicio</a><span>›</span><a href="categorias.html">Categorías</a><span>›</span><span aria-current="page">${escapeHtml(parent.name)}</span>`;
  $('#listing-filters-link').href = `catalogo.html?category=${encodeURIComponent(parent.slug)}`;

  const navigation = $('#category-navigation');
  const chips = $('#subcategories');
  if (children.length) {
    navigation.hidden = false;
    const expanded = children.length > 7;
    navigation.classList.toggle('category-navigation--expanded', expanded);
    chips.className = expanded ? 'subcategory-grid' : 'chip-row';
    chips.innerHTML = `<button class="category-filter" data-category="" type="button">Todos</button>${children.map(child => `<button class="category-filter" data-category="${escapeHtml(child.slug)}" type="button"><span>${escapeHtml(child.name)}</span><b aria-hidden="true">›</b></button>`).join('')}`;
  }

  let activeChild = initialChild;
  let page = 0;
  let loaded = [];
  let requestVersion = 0;
  const root = $('#listing-products');
  const loadMore = $('#load-more');

  async function renderSelection({ updateUrl = false, reset = true } = {}) {
    if (reset) {
      page = 0;
      loaded = [];
    }
    const version = ++requestVersion;
    const categoryIds = categoryIdsWithDescendants(categories, activeChild?.id || parent.id);
    const result = await getProducts({ categoryId: categoryIds, page, pageSize: CATEGORY_PAGE_SIZE, sort: 'name' });
    if (version !== requestVersion) return;
    loaded = reset ? result.products : [...loaded, ...result.products];
    const total = result.count ?? loaded.length;
    root.classList.remove('skeleton-grid');
    document.querySelectorAll('.category-filter').forEach(button => {
      const selected = button.dataset.category === (activeChild?.slug || '');
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const heading = activeChild ? activeChild.name : `Todos los ${normalizeText(parent.name).includes('accesor') ? 'accesorios' : 'productos'}`;
    $('#listing-product-heading').textContent = heading;
    $('#listing-count').textContent = `${total} producto${total === 1 ? '' : 's'}`;
    $('#listing-filters-link').href = `catalogo.html?category=${encodeURIComponent(activeChild?.slug || parent.slug)}`;
    if (loaded.length) renderProducts(root, loaded);
    else root.innerHTML = emptyState('Todavía no hay productos disponibles', 'Explora otras categorías mientras agregamos novedades.', 'categorias.html', 'Explorar otras categorías');
    loadMore.hidden = loaded.length >= total || result.products.length < CATEGORY_PAGE_SIZE;
    renderTeams(activeChild, teams, loaded);
    if (updateUrl) {
      const query = new URLSearchParams({ slug: parent.slug });
      if (activeChild) query.set('sub', activeChild.slug);
      history.pushState({ sub: activeChild?.slug || '' }, '', `${location.pathname}?${query}`);
    }
  }

  chips.addEventListener('click', async event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    activeChild = children.find(item => item.slug === button.dataset.category) || null;
    await renderSelection({ updateUrl: true });
    $('#listing-product-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  window.addEventListener('popstate', async () => {
    activeChild = children.find(item => item.slug === params().get('sub')) || null;
    await renderSelection();
  });
  loadMore.addEventListener('click', async () => {
    page += 1;
    await renderSelection({ reset: false });
  });
  $('#share-listing').addEventListener('click', async () => {
    const result = await sharePage({ title: document.title, text: `Mira ${activeChild?.name || parent.name} en Fuera de Lugar Sport` });
    if (result === 'copied') toast('Enlace copiado');
  });
  await renderSelection();
}

function renderTeams(category, teams, products) {
  const root = $('#category-teams');
  const key = normalizeText(category?.slug || category?.name || '');
  const requestedType = key.includes('seleccion') ? 'national_team'
    : key.includes('colombian') || key.includes('colombia') ? 'colombian_team'
      : key.includes('club') ? 'club' : '';
  if (!requestedType) {
    root.hidden = true;
    root.innerHTML = '';
    return;
  }
  const teamIds = new Set(products.map(product => product.team_id).filter(Boolean));
  const visible = teams.filter(team => team.type === requestedType && teamIds.has(team.id)).sort(byName);
  if (!visible.length) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  root.innerHTML = `<div class="listing-section-head"><h2>${requestedType === 'national_team' ? 'Selecciones' : requestedType === 'colombian_team' ? 'Equipos colombianos' : 'Clubes'}</h2><span>${visible.length} disponibles</span></div><div class="team-strip category-team-strip">${visible.map(teamTile).join('')}</div>`;
}

function teamTile(team) {
  const initials = team.name.split(/\s+/).map(word => word[0]).join('').slice(0, 3).toUpperCase();
  const crest = team.crest_url
    ? `<span class="team-crest"><img src="${escapeHtml(optimizedStorageAsset(team.crest_url))}" srcset="${escapeHtml(crestSrcset(team.crest_url))}" sizes="50px" data-original-src="${escapeHtml(localAsset(team.crest_url))}" onerror="if(!this.dataset.fallbackApplied){this.dataset.fallbackApplied='true';this.removeAttribute('srcset');this.src=this.dataset.originalSrc}else if(this.parentElement){this.hidden=true;this.parentElement.classList.add('team-crest--fallback');this.parentElement.textContent=this.dataset.teamInitials}" alt="Escudo ${escapeHtml(team.name)}" width="88" height="88" loading="lazy" decoding="async" data-team-crest-image data-team-initials="${escapeHtml(initials)}"></span>`
    : `<span class="team-crest team-crest--fallback">${escapeHtml(initials)}</span>`;
  return `<a class="team-card" href="${getTeamUrl(team.slug)}">${crest}<strong>${escapeHtml(team.name)}</strong><small>Ver productos</small></a>`;
}
