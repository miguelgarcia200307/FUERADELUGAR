import { confirmAction, openModal } from '../components/modal.js';
import { renderProducts } from '../components/product-card.js';
import { toast } from '../components/toast.js';
import { getProducts, getProductsByIds } from '../lib/api.js';
import { $, currentPrice, emptyState, escapeHtml, formatMoney, isPromoActive, productImage } from '../lib/helpers.js';
import { clearCart, getCart, removeCartLine, setCart, updateCartLine } from '../lib/store.js';

let productsById = new Map();
let lineStatus = new Map();
let summaryObserver;

export async function initCart() {
  const saved = getCart();
  if (!saved.length) {
    renderCart();
    loadRecommendations([]);
    return;
  }
  try {
    const products = await getProductsByIds([...new Set(saved.map(item => item.product_id).filter(Boolean))]);
    productsById = new Map(products.map(product => [product.id, product]));
    const refreshed = saved.map(refreshLine);
    setCart(refreshed);
  } catch (error) {
    console.error('No se pudo revalidar el carrito:', error);
    lineStatus = new Map(saved.map(item => [item.line_id, { valid: false, reason: 'No pudimos confirmar disponibilidad. Revisa tu conexión e intenta de nuevo.' }]));
  }
  renderCart();
  loadRecommendations([...productsById.values()]);
}

function refreshLine(item) {
  const product = productsById.get(item.product_id);
  if (!product) {
    lineStatus.set(item.line_id, { valid: false, reason: 'Este producto ya no está publicado.' });
    return item;
  }
  const variant = (product.product_variants || []).find(option => option.id === item.variant_id);
  if (!variant || !variant.active) {
    lineStatus.set(item.line_id, { valid: false, reason: 'Esta combinación ya no está disponible.' });
    return { ...item, price: currentPrice(product) };
  }
  const color = (product.product_colors || []).find(option => option.id === variant.color_id);
  const size = (product.product_sizes || []).find(option => option.id === variant.size_id);
  const stock = product.force_sold_out ? 0 : Number(variant.stock || 0);
  const price = currentPrice(product);
  const priceChanged = Number(item.price) !== price;
  const valid = stock >= Number(item.quantity) && stock > 0;
  lineStatus.set(item.line_id, {
    valid,
    priceChanged,
    reason: stock === 0 ? 'Esta talla acaba de agotarse.' : valid ? '' : `Actualmente solo quedan ${stock} unidades.`
  });
  return {
    ...item,
    name: product.name,
    slug: product.slug,
    image: productImage(product, color?.id),
    color_id: color?.id || item.color_id,
    color: color?.name || item.color,
    size_id: size?.id || item.size_id,
    size: size?.name || item.size,
    stock,
    price
  };
}

function renderCart() {
  const cart = getCart();
  const root = $('#cart-items');
  root.classList.remove('is-loading');
  const units = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  $('#cart-count-label').textContent = `${units} producto${units === 1 ? '' : 's'} en tu pedido`;
  $('#cart-notices').innerHTML = noticesMarkup(cart);

  if (!cart.length) {
    root.innerHTML = emptyState('Tu carrito está vacío', 'Explora el catálogo y encuentra algo para ti.', 'catalogo.html', 'Explorar productos');
    $('#cart-summary').hidden = true;
    $('#cart-sticky-checkout').hidden = true;
    $('#cart-count-label').textContent = '0 productos';
    bindCartEvents();
    return;
  }

  $('#cart-summary').hidden = false;
  root.innerHTML = cart.map(cartItemMarkup).join('');
  renderSummary(cart);
  bindCartEvents();
  observeSummary();
}

function noticesMarkup(cart) {
  const changed = cart.filter(item => lineStatus.get(item.line_id)?.priceChanged).length;
  const invalid = cart.filter(item => lineStatus.get(item.line_id)?.valid === false).length;
  return `${changed ? `<p class="cart-notice cart-notice--info"><span>i</span>${changed === 1 ? 'Actualizamos el precio de un producto.' : `Actualizamos el precio de ${changed} productos.`}</p>` : ''}${invalid ? `<p class="cart-notice cart-notice--warning"><span>!</span>Revisa ${invalid === 1 ? 'un producto' : `${invalid} productos`} antes de continuar.</p>` : ''}`;
}

function cartItemMarkup(item) {
  const product = productsById.get(item.product_id);
  const status = lineStatus.get(item.line_id) || { valid: true };
  const unit = Number(item.price) + Number(item.personalization_price || 0);
  const meta = product?.teams?.name || product?.brands?.name || '';
  const promo = product && isPromoActive(product);
  return `<article class="cart-item${status.valid ? '' : ' cart-item--invalid'}" data-line="${escapeHtml(item.line_id)}">
    <a class="cart-item__media" href="producto.html?slug=${encodeURIComponent(item.slug)}" aria-label="Ver ${escapeHtml(item.name)}"><img class="cart-item__image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy"></a>
    <div class="cart-item__content">
      ${meta ? `<span class="cart-item__meta">${escapeHtml(meta)}</span>` : ''}
      <h3><a href="producto.html?slug=${encodeURIComponent(item.slug)}">${escapeHtml(item.name)}</a></h3>
      <div class="cart-item__variants"><span>${escapeHtml(item.color || 'Color')}</span><span>${escapeHtml(item.size || 'Talla')}</span></div>
      ${personalizationMarkup(item)}
      ${status.valid ? '' : `<p class="cart-item__alert"><span aria-hidden="true">!</span>${escapeHtml(status.reason)}</p>`}
      ${status.priceChanged ? '<p class="cart-item__price-note">Precio actualizado</p>' : ''}
      <div class="cart-item__purchase">
        <div class="quantity"><button data-action="minus" type="button" aria-label="Reducir cantidad de ${escapeHtml(item.name)}" ${item.quantity <= 1 ? 'disabled' : ''}>−</button><input value="${item.quantity}" min="1" max="${Math.max(1, Number(item.stock || 1))}" inputmode="numeric" type="number" aria-label="Cantidad de ${escapeHtml(item.name)}"><button data-action="plus" type="button" aria-label="Aumentar cantidad de ${escapeHtml(item.name)}" ${!status.valid || item.quantity >= item.stock ? 'disabled' : ''}>+</button></div>
        <div class="cart-item__price">${promo ? `<small><del>${formatMoney(Number(product.base_price) * item.quantity)}</del></small>` : ''}<strong>${formatMoney(unit * item.quantity)}</strong>${item.quantity > 1 ? `<small>${formatMoney(unit)} c/u</small>` : ''}</div>
      </div>
      <div class="cart-item__links"><button data-action="edit" type="button">${item.personalization ? 'Editar producto y personalización' : 'Editar talla o color'}</button><button data-action="remove" type="button">Eliminar</button></div>
    </div>
  </article>`;
}

function personalizationMarkup(item) {
  const custom = item.personalization;
  if (!custom) return '';
  const parts = [custom.name && `Nombre: ${custom.name}`, custom.number && `Número: ${custom.number}`, custom.font && `Fuente: ${custom.font}`].filter(Boolean);
  return parts.length ? `<div class="cart-item__custom"><strong>Personalización</strong><span>${escapeHtml(parts.join(' · '))}</span></div>` : '';
}

function renderSummary(cart) {
  const products = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const personalization = cart.reduce((sum, item) => sum + Number(item.personalization_price || 0) * item.quantity, 0);
  const total = products + personalization;
  const invalid = cart.some(item => lineStatus.get(item.line_id)?.valid === false);
  const units = cart.reduce((sum, item) => sum + item.quantity, 0);
  $('#cart-summary').innerHTML = `<div class="summary-card__head"><h2>Resumen del pedido</h2><button id="clear-cart" type="button">Vaciar</button></div><div class="summary-line"><span>Productos (${units})</span><strong>${formatMoney(products)}</strong></div><div class="summary-line"><span>Personalización</span><strong>${formatMoney(personalization)}</strong></div><div class="summary-line summary-line--total"><span>Total</span><strong>${formatMoney(total)}</strong></div><p class="summary-shipping">La entrega, el envío y la disponibilidad final se confirman por WhatsApp.</p>${invalid ? '<button class="btn btn--primary btn--block" type="button" disabled>Revisa el carrito para continuar</button>' : '<a class="btn btn--primary btn--block" href="checkout.html">Continuar pedido</a>'}<a class="btn btn--ghost btn--block" href="catalogo.html">Seguir comprando</a>`;
  const sticky = $('#cart-sticky-checkout');
  sticky.hidden = false;
  sticky.innerHTML = `<span>Total<strong>${formatMoney(total)}</strong></span>${invalid ? '<button type="button" disabled>Revisar carrito</button>' : '<a href="checkout.html">Continuar</a>'}`;
}

function bindCartEvents() {
  const root = $('#cart-items');
  root.onclick = async event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const row = event.target.closest('[data-line]');
    if (!action || !row) return;
    const item = getCart().find(candidate => candidate.line_id === row.dataset.line);
    if (!item) return;
    if (action === 'remove') {
      await openRemoveCartDialog(item, event.target.closest('[data-action="remove"]'));
      return;
    }
    if (action === 'edit') {
      if (item.personalization) location.href = `producto.html?slug=${encodeURIComponent(item.slug)}&edit=${encodeURIComponent(item.line_id)}`;
      else openVariantEditor(item);
      return;
    }
    const next = action === 'plus' ? item.quantity + 1 : item.quantity - 1;
    if (next < 1) return;
    if (next > item.stock) {
      toast(`Solo quedan ${item.stock} unidades`, 'error');
      return;
    }
    updateCartLine(item.line_id, { quantity: next });
    const valid = Number(item.stock) > 0 && next <= Number(item.stock);
    lineStatus.set(item.line_id, { ...(lineStatus.get(item.line_id) || {}), valid, reason: valid ? '' : `Actualmente solo quedan ${item.stock} unidades.` });
    toast('Cantidad actualizada');
    renderCart();
  };
  root.onchange = event => {
    const input = event.target.closest('.quantity input');
    const row = event.target.closest('[data-line]');
    if (!input || !row) return;
    const item = getCart().find(candidate => candidate.line_id === row.dataset.line);
    if (!item) return;
    const requested = Math.max(1, Number(input.value) || 1);
    const value = Math.min(Number(item.stock || 1), requested);
    if (requested > item.stock) toast(`Solo quedan ${item.stock} unidades`, 'error');
    updateCartLine(item.line_id, { quantity: value });
    lineStatus.set(item.line_id, { ...(lineStatus.get(item.line_id) || {}), valid: Number(item.stock) > 0, reason: Number(item.stock) > 0 ? '' : 'Esta talla acaba de agotarse.' });
    renderCart();
  };
  $('#clear-cart')?.addEventListener('click', async () => {
    if (await confirmAction('¿Quieres vaciar todo el carrito?', 'Vaciar carrito')) {
      clearCart();
      lineStatus.clear();
      toast('Carrito vacío');
      renderCart();
    }
  });
}

function removeDialogProductMarkup(item) {
  const custom = item.personalization;
  const customValue = custom && [custom.name, custom.number].filter(Boolean).join(' · ');
  const details = [
    item.color && `<span><b>Color</b>${escapeHtml(item.color)}</span>`,
    item.size && `<span><b>Talla</b>${escapeHtml(item.size)}</span>`,
    customValue && `<span><b>Personalización</b>${escapeHtml(customValue)}</span>`,
    `<span><b>Cantidad</b>${Number(item.quantity) || 1}</span>`
  ].filter(Boolean).join('');
  return `<div class="cart-remove-dialog__product">
    <span class="cart-remove-dialog__thumb"><img src="${escapeHtml(item.image)}" alt="" loading="eager"></span>
    <div><strong>${escapeHtml(item.name)}</strong><div class="cart-remove-dialog__details">${details}</div></div>
  </div>`;
}

function openRemoveCartDialog(item, trigger) {
  const content = document.createElement('div');
  content.className = 'cart-remove-dialog';
  content.innerHTML = `${removeDialogProductMarkup(item)}
    <div class="cart-remove-dialog__copy"><p>¿Quieres quitar este producto del carrito?</p><small>Podrás agregarlo nuevamente cuando quieras.</small></div>
    <p class="cart-remove-dialog__error" role="alert" tabindex="-1" hidden></p>
    <div class="cart-remove-dialog__actions">
      <button class="btn btn--ghost" data-cancel-remove type="button">Cancelar</button>
      <button class="btn btn--danger" data-confirm-remove type="button">Quitar</button>
    </div>`;
  const warningIcon = '<svg viewBox="0 0 24 24" focusable="false"><path d="M9 4h6m-8 3h10m-9 0 .7 12h6.6L16 7M10 10v6m4-6v6"></path></svg>';
  const modal = openModal({
    title: 'Quitar producto del carrito',
    description: '¿Quieres quitar este producto del carrito? Podrás agregarlo nuevamente cuando quieras.',
    content,
    className: 'modal--cart-remove',
    headerIcon: warningIcon,
    initialFocus: '[data-cancel-remove]',
    trigger
  });
  const cancelButton = content.querySelector('[data-cancel-remove]');
  const confirmButton = content.querySelector('[data-confirm-remove]');
  const errorRoot = content.querySelector('.cart-remove-dialog__error');
  let removing = false;
  cancelButton.addEventListener('click', () => { if (!removing) modal.close(); });
  confirmButton.addEventListener('click', async () => {
    if (removing) return;
    removing = true;
    modal.setDismissible(false);
    errorRoot.hidden = true;
    cancelButton.disabled = true;
    confirmButton.disabled = true;
    confirmButton.innerHTML = '<span class="spinner" aria-hidden="true"></span>Quitando…';
    try {
      await Promise.resolve().then(() => removeCartLine(item.line_id));
      if (getCart().some(candidate => candidate.line_id === item.line_id)) throw new Error('La línea continúa en el carrito.');
      lineStatus.delete(item.line_id);
      renderCart();
      toast('Producto quitado del carrito');
      modal.close(true);
    } catch (error) {
      console.error('No se pudo quitar el producto del carrito:', error);
      removing = false;
      modal.setDismissible(true);
      cancelButton.disabled = false;
      confirmButton.disabled = false;
      confirmButton.textContent = 'Quitar';
      errorRoot.textContent = 'No pudimos quitar el producto. Intenta nuevamente.';
      errorRoot.hidden = false;
      errorRoot.focus();
    }
  });
}

function openVariantEditor(item) {
  const product = productsById.get(item.product_id);
  if (!product) {
    toast('Este producto ya no se puede editar', 'error');
    return;
  }
  const validVariants = (product.product_variants || []).filter(variant => variant.active && Number(variant.stock) > 0 && !product.force_sold_out);
  if (!validVariants.length) {
    toast('No hay variantes disponibles', 'error');
    return;
  }
  const colors = (product.product_colors || []).filter(color => validVariants.some(variant => variant.color_id === color.id)).sort((a, b) => a.sort_order - b.sort_order);
  const sizes = (product.product_sizes || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  let color = colors.find(option => option.id === item.color_id) || colors[0];
  let size = sizes.find(option => option.id === item.size_id && variantFor(option.id)) || sizes.find(option => variantFor(option.id));
  function variantFor(sizeId) { return validVariants.find(variant => variant.color_id === color.id && variant.size_id === sizeId); }

  const wrapper = document.createElement('div');
  wrapper.className = 'variant-editor';
  const modal = openModal({ title: 'Editar talla o color', content: wrapper });
  function draw() {
    const selectedVariant = variantFor(size?.id);
    wrapper.innerHTML = `<div class="variant-editor__product"><img src="${escapeHtml(productImage(product, color.id))}" alt="${escapeHtml(product.name)}"><div><small>${escapeHtml(product.teams?.name || product.brands?.name || '')}</small><strong>${escapeHtml(product.name)}</strong><span>${formatMoney(currentPrice(product))}</span></div></div><fieldset><legend>Color</legend><div class="variant-editor__options">${colors.map(option => `<button class="variant-choice ${option.id === color.id ? 'active' : ''}" data-color="${option.id}" type="button">${escapeHtml(option.name)}</button>`).join('')}</div></fieldset><fieldset><legend>Talla</legend><div class="variant-editor__options">${sizes.map(option => `<button class="variant-choice ${option.id === size?.id ? 'active' : ''}" data-size="${option.id}" type="button" ${variantFor(option.id) ? '' : 'disabled'}>${escapeHtml(option.name)}</button>`).join('')}</div></fieldset><p class="variant-editor__stock">${selectedVariant ? `${selectedVariant.stock} unidad${selectedVariant.stock === 1 ? '' : 'es'} disponible${selectedVariant.stock === 1 ? '' : 's'}` : 'Elige una combinación disponible'}</p><button class="btn btn--primary btn--block" data-save-variant type="button" ${selectedVariant ? '' : 'disabled'}>Guardar cambios</button>`;
  }
  wrapper.addEventListener('click', event => {
    const colorButton = event.target.closest('[data-color]');
    const sizeButton = event.target.closest('[data-size]');
    if (colorButton) {
      color = colors.find(option => option.id === colorButton.dataset.color);
      size = sizes.find(option => variantFor(option.id));
      draw();
      return;
    }
    if (sizeButton) {
      size = sizes.find(option => option.id === sizeButton.dataset.size);
      draw();
      return;
    }
    if (event.target.closest('[data-save-variant]')) {
      const variant = variantFor(size?.id);
      if (!variant) return;
      const quantity = Math.min(item.quantity, Number(variant.stock));
      updateCartLine(item.line_id, { variant_id: variant.id, color_id: color.id, color: color.name, size_id: size.id, size: size.name, stock: Number(variant.stock), quantity, image: productImage(product, color.id), price: currentPrice(product) });
      lineStatus.set(item.line_id, { valid: true, priceChanged: false, reason: '' });
      modal.close();
      toast(quantity < item.quantity ? `Variante actualizada. Solo quedan ${quantity} unidades.` : 'Variante actualizada');
      renderCart();
    }
  });
  draw();
}

function observeSummary() {
  summaryObserver?.disconnect();
  const sticky = $('#cart-sticky-checkout');
  const summary = $('#cart-summary');
  if (!('IntersectionObserver' in window) || !summary) return;
  summaryObserver = new IntersectionObserver(([entry]) => sticky.classList.toggle('is-hidden', entry.isIntersecting && entry.intersectionRatio > .55), { threshold: [.55] });
  summaryObserver.observe(summary);
}

async function loadRecommendations(cartProducts) {
  try {
    const first = cartProducts[0];
    const categoryId = first?.product_categories?.[0]?.category_id;
    const { products } = await getProducts({ teamId: first?.team_id || undefined, categoryId: first?.team_id ? undefined : categoryId, featured: first ? undefined : true, pageSize: 8 });
    const inCart = new Set(getCart().map(item => item.product_id));
    const recommendations = products.filter(product => !inCart.has(product.id) && !product.force_sold_out && product.product_variants.some(variant => variant.active && Number(variant.stock) > 0)).slice(0, 6);
    if (!recommendations.length) return;
    $('#cart-recommendations').hidden = false;
    renderProducts($('#cart-recommendation-products'), recommendations);
  } catch (error) {
    console.warn('No se pudieron cargar recomendaciones:', error);
  }
}
