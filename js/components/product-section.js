import { renderProducts } from './product-card.js';
import { escapeHtml } from '../lib/helpers.js';

export function renderProductSection(root, { eyebrow = '', title, products = [], seeAllUrl = 'catalogo.html', seeAllText = 'Ver todos' }) {
  if (!root) return false;
  if (!products.length) {
    root.hidden = true;
    root.innerHTML = '';
    return false;
  }
  root.hidden = false;
  root.innerHTML = `<div class="container"><div class="section-heading"><div>${eyebrow ? `<span class="section-kicker">${escapeHtml(eyebrow)}</span>` : ''}<h2>${escapeHtml(title)}</h2></div><a href="${seeAllUrl}">${escapeHtml(seeAllText)} <span aria-hidden="true">›</span></a></div><div class="product-grid"></div></div>`;
  renderProducts(root.querySelector('.product-grid'), products);
  return true;
}
