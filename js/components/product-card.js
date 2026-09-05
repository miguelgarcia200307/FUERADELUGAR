import { currentPrice, discountPercent, escapeHtml, formatMoney, getProductUrl, isPromoActive, productImage } from '../lib/helpers.js';
import { isFavorite, toggleFavorite } from '../lib/store.js';
import { toast } from './toast.js';

function totalStock(product) {
  return (product.product_variants || []).filter(v => v.active).reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
}

export function productCard(product) {
  const promo = isPromoActive(product);
  const stock = product.force_sold_out ? 0 : totalStock(product);
  const isNew = Date.now() - new Date(product.created_at).getTime() < 1000 * 60 * 60 * 24 * 14;
  const meta = product.teams?.name || product.brands?.name || 'Fuera de Lugar Sport';
  const lowStock = stock > 0 && (product.force_last_units || stock <= 3);
  const badge = stock === 0
    ? '<span class="status-badge status-badge--sold">AGOTADO</span>'
    : lowStock
      ? `<span class="status-badge status-badge--low">${stock <= 3 ? `ÚLTIMAS ${stock}` : 'ÚLTIMAS UNIDADES'}</span>`
      : promo
        ? `<span class="status-badge status-badge--sale">-${discountPercent(product)}%</span>`
        : isNew ? '<span class="status-badge status-badge--new">NUEVO</span>' : '';
  return `<article class="product-card" data-product-id="${product.id}">
    <div class="product-card__media${stock === 0 ? ' is-sold-out' : ''}">
      <a href="${getProductUrl(product.slug)}" aria-label="Ver ${escapeHtml(product.name)}"><img src="${productImage(product)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async" width="500" height="625"></a>
      ${badge}
      <button class="product-card__favorite ${isFavorite(product.id) ? 'active' : ''}" type="button" aria-label="${isFavorite(product.id) ? 'Quitar de' : 'Agregar a'} favoritos" data-favorite="${product.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.7a5.4 5.4 0 0 0-7.7 0L12 5.8l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.6a5.4 5.4 0 0 0 0-7.7Z"></path></svg></button>
    </div>
    <div class="product-card__body"><div class="product-card__meta">${escapeHtml(meta)}</div><h3><a href="${getProductUrl(product.slug)}">${escapeHtml(product.name)}</a></h3><div class="price"><strong>${formatMoney(currentPrice(product))}</strong>${promo ? `<del>${formatMoney(product.base_price)}</del>` : ''}</div><span class="stock-line ${stock === 0 ? 'stock-line--danger' : lowStock ? 'stock-line--low' : ''}">${stock === 0 ? 'No disponible' : lowStock ? 'Pocas unidades' : 'Disponible para pedir'}</span></div>
  </article>`;
}

export function bindProductCards(root = document) {
  root.querySelectorAll('[data-favorite]:not([data-bound])').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const active = toggleFavorite(button.dataset.favorite);
    button.classList.toggle('active', active);
    button.setAttribute('aria-label', `${active ? 'Quitar de' : 'Agregar a'} favoritos`);
    toast(active ? 'Guardado en favoritos' : 'Eliminado de favoritos');
    button.dispatchEvent(new CustomEvent('favorite:toggled', { bubbles: true, detail: { id: button.dataset.favorite, active } }));
  }));
  root.querySelectorAll('[data-favorite]').forEach(button => { button.dataset.bound = 'true'; });
  root.querySelectorAll('.product-card:not([data-card-bound])').forEach(card => {
    card.dataset.cardBound = 'true';
    card.addEventListener('click', event => {
      if (event.target.closest('a,button')) return;
      const link = card.querySelector('a[href]');
      if (link) location.href = link.href;
    });
  });
}

export function renderProducts(root, products) {
  root.classList.remove('skeleton-grid', 'is-loading');
  root.setAttribute('aria-busy', 'false');
  root.innerHTML = products.map(productCard).join('');
  bindProductCards(root);
}

export function renderProductSkeletons(root, count = 10) {
  root.classList.add('is-loading');
  root.setAttribute('aria-busy', 'true');
  root.innerHTML = Array.from({ length: count }, () => `<article class="product-card-skeleton" aria-hidden="true"><span></span><i></i><i></i><i></i></article>`).join('');
}
