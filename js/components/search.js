import { clearRecentSearches, getRecentSearches, getSearchSuggestions, saveRecentSearch } from '../lib/search.js';
import { categoryInitials, currentPrice, debounce, escapeHtml, formatMoney, getCategoryUrl, getProductUrl, localAsset } from '../lib/helpers.js';

const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg>';

function emptyPanel() {
  const recent = getRecentSearches();
  return `<div class="search-panel__head"><strong>${recent.length ? 'Búsquedas recientes' : 'Ideas para buscar'}</strong>${recent.length ? '<button type="button" data-clear-recent>Limpiar</button>' : ''}</div>
    <div class="search-chips">${(recent.length ? recent : ['Real Madrid', 'Guayos', 'Colombia', 'Balones']).map(item => `<button type="button" data-search-term="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}</div>`;
}

function entityRow(item, type) {
  const config = {
    team: { label: 'Equipo', url: `catalogo.html?team=${encodeURIComponent(item.slug)}`, image: item.crest_url, icon: '⚽' },
    category: { label: 'Categoría', url: getCategoryUrl(item.slug), image: item.image_url, icon: categoryInitials(item.name) },
    brand: { label: 'Marca', url: `marca.html?slug=${encodeURIComponent(item.slug)}`, image: item.logo_url, icon: '◇' }
  }[type];
  return `<a class="search-result search-result--entity" href="${config.url}">
    <span class="search-result__thumb">${config.image ? `<img src="${localAsset(config.image)}" alt="">` : config.icon}</span>
    <span><small>${config.label}</small><strong>${escapeHtml(item.name)}</strong></span><span class="search-result__arrow">›</span>
  </a>`;
}

function productRow(item) {
  return `<a class="search-result" href="${getProductUrl(item.slug)}">
    <span class="search-result__thumb"><img src="${localAsset(item.image_url)}" alt=""></span>
    <span><small>${item.promotion ? 'Promoción' : escapeHtml(item.team_name || item.brand_name || 'Producto')}</small><strong>${escapeHtml(item.name)}</strong></span>
    <span class="search-result__price">${formatMoney(currentPrice(item))}</span>
  </a>`;
}

function resultsPanel(results, term) {
  const entities = [
    ...results.teams.map(item => entityRow(item, 'team')),
    ...results.categories.map(item => entityRow(item, 'category')),
    ...results.brands.map(item => entityRow(item, 'brand'))
  ];
  const products = results.products.map(productRow);
  if (!entities.length && !products.length) {
    return `<div class="search-empty"><strong>No encontramos “${escapeHtml(term)}”</strong><span>Prueba con otra palabra o explora el catálogo.</span></div><a class="search-all" href="catalogo.html">Ver todos los productos <span>›</span></a>`;
  }
  return `${entities.length ? `<div class="search-group-label">Explora</div>${entities.join('')}` : ''}${products.length ? `<div class="search-group-label">Productos</div>${products.join('')}` : ''}<a class="search-all" href="catalogo.html?q=${encodeURIComponent(term)}">Ver todos los resultados <span>›</span></a>`;
}

export function searchBox(id, mobile = false) {
  return `<form class="market-search${mobile ? ' market-search--mobile' : ''}" data-search-form role="search">
    <label class="sr-only" for="${id}">Buscar en la tienda</label>
    <span class="market-search__icon">${searchIcon}</span>
    <input id="${id}" type="search" name="q" placeholder="Buscar Real Madrid, guayos, balones…" autocomplete="off" enterkeyhint="search" aria-autocomplete="list" aria-expanded="false">
    <button class="market-search__clear" type="button" aria-label="Limpiar búsqueda" hidden>×</button>
    <div class="search-suggestions" role="listbox" hidden></div>
  </form>`;
}

export function bindSearch(root = document) {
  root.querySelectorAll('[data-search-form]').forEach(form => {
    const input = form.querySelector('input');
    const panel = form.querySelector('.search-suggestions');
    const clear = form.querySelector('.market-search__clear');
    let requestId = 0;
    let activeIndex = -1;

    const setOpen = open => {
      panel.hidden = !open;
      input.setAttribute('aria-expanded', String(open));
      form.classList.toggle('is-open', open);
    };
    const renderInitial = () => { panel.innerHTML = emptyPanel(); setOpen(true); activeIndex = -1; };
    const runSearch = debounce(async () => {
      const term = input.value.trim();
      const currentRequest = ++requestId;
      clear.hidden = !term;
      if (term.length < 2) { renderInitial(); return; }
      panel.innerHTML = '<div class="search-loading" aria-label="Buscando"></div>';
      setOpen(true);
      try {
        const results = await getSearchSuggestions(term);
        if (currentRequest !== requestId || term !== input.value.trim()) return;
        panel.innerHTML = resultsPanel(results, term);
        activeIndex = -1;
      } catch (error) {
        if (currentRequest !== requestId) return;
        console.error(error);
        panel.innerHTML = '<div class="search-empty"><strong>No pudimos buscar ahora</strong><span>Revisa tu conexión e intenta nuevamente.</span></div>';
      }
    }, 220);

    input.addEventListener('focus', () => input.value.trim().length >= 2 ? runSearch() : renderInitial());
    input.addEventListener('input', runSearch);
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') { setOpen(false); input.blur(); return; }
      const options = [...panel.querySelectorAll('a, [data-search-term]')];
      if (!options.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
      if (event.key === 'Enter' && activeIndex < 0) return;
      event.preventDefault();
      if (event.key === 'ArrowDown') activeIndex = (activeIndex + 1) % options.length;
      if (event.key === 'ArrowUp') activeIndex = (activeIndex - 1 + options.length) % options.length;
      options.forEach((option, index) => option.classList.toggle('is-active', index === activeIndex));
      if (event.key === 'Enter') options[activeIndex]?.click();
    });
    panel.addEventListener('click', event => {
      const termButton = event.target.closest('[data-search-term]');
      if (termButton) { input.value = termButton.dataset.searchTerm; clear.hidden = false; runSearch(); input.focus(); }
      if (event.target.closest('[data-clear-recent]')) { clearRecentSearches(); renderInitial(); }
      const link = event.target.closest('a');
      if (link) {
        saveRecentSearch(input.value);
        if (document.body.dataset.page === 'home' && link.matches('.search-all')) {
          event.preventDefault();
          setOpen(false);
          window.dispatchEvent(new CustomEvent('home:search', { detail: { query: input.value.trim() } }));
        }
      }
    });
    clear.addEventListener('click', () => {
      input.value = '';
      clear.hidden = true;
      requestId += 1;
      renderInitial();
      input.focus();
      if (document.body.dataset.page === 'home') window.dispatchEvent(new CustomEvent('home:search', { detail: { query: '' } }));
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const term = input.value.trim();
      if (!term) return;
      saveRecentSearch(term);
      if (document.body.dataset.page === 'home') {
        setOpen(false);
        window.dispatchEvent(new CustomEvent('home:search', { detail: { query: term } }));
        return;
      }
      location.href = `catalogo.html?q=${encodeURIComponent(term)}`;
    });
    document.addEventListener('pointerdown', event => { if (!form.contains(event.target)) setOpen(false); });
  });
}
