import { getPaymentMethods, validateCart } from '../lib/api.js';
import { loadSettings } from '../components/layout.js';
import { toast } from '../components/toast.js';
import { $, debounce, emptyState, escapeHtml, formatMoney, localAsset, paymentInitials } from '../lib/helpers.js';
import { clearCart, getCart, setCart } from '../lib/store.js';

const DRAFT_KEY = 'fueradelugar_checkout_v1';
const DELIVERY_WITH_ADDRESS = new Set(['Domicilio', 'Envío nacional']);
let submitting = false;

export async function initCheckout() {
  let cart = getCart();
  if (!cart.length) {
    $('.checkout-page').innerHTML = emptyState('Tu carrito está vacío', 'Agrega productos antes de finalizar el pedido.');
    $('#checkout-sticky').hidden = true;
    return;
  }

  const form = $('#checkout-form');
  const settings = await loadSettings();
  const draft = readDraft();
  let methods = [];
  try {
    methods = await getPaymentMethods();
  } catch (error) {
    console.error('No se pudieron cargar los métodos de pago:', error);
  }

  configurePickup(settings);
  renderPaymentMethods(methods, draft.payment);
  restoreDraft(form, draft);
  updateDelivery(form.elements.delivery.value, settings);
  renderSummary(cart, form.elements.delivery.value);
  bindDraftPersistence(form);
  bindValidation(form, methods);
  bindStickyAction();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !validateForm(form, methods, true)) return;
    submitting = true;
    setCheckoutLoading(true, 'Revisando pedido…');
    renderStatus('info', 'Estamos verificando precios, promociones y disponibilidad antes de abrir WhatsApp.', '', '', false);

    try {
      const validation = await validateCart(cart);
      const missing = cart.filter(item => !validation.some(row => row.variant_id === item.variant_id));
      const invalid = validation.filter(row => !row.valid);
      if (missing.length || invalid.length) {
        const issues = [
          ...invalid.map(row => `${row.product_name || 'Producto'}: ${humanizeAvailability(row.reason)}`),
          ...missing.map(item => `${item.name}: ya no está disponible.`)
        ];
        renderStatus('error', issues[0], 'Revisar y actualizar el carrito', 'carrito.html');
        toast(issues[0], 'error', 6500);
        return;
      }

      let priceChanged = false;
      cart = cart.map(item => {
        const fresh = validation.find(row => row.variant_id === item.variant_id);
        if (Number(item.price) !== Number(fresh.current_price)) priceChanged = true;
        return { ...item, name: fresh.product_name, slug: fresh.product_slug, color: fresh.color_name, size: fresh.size_name, stock: fresh.stock, price: Number(fresh.current_price) };
      });
      setCart(cart);
      renderSummary(cart, form.elements.delivery.value);

      if (priceChanged) {
        renderStatus('info', 'El precio de uno de tus productos se actualizó. Revisa el nuevo total y vuelve a enviar el pedido.');
        toast('Actualizamos el total con los precios vigentes.');
        return;
      }

      const customer = normalizedFormData(form);
      const whatsapp = String(settings.whatsapp || '').replace(/\D/g, '');
      if (!whatsapp) {
        renderStatus('error', 'La tienda no tiene un número de WhatsApp configurado. Intenta nuevamente más tarde.');
        toast('No pudimos abrir WhatsApp. Contacta a la tienda.', 'error');
        return;
      }

      setCheckoutLoading(true, 'Preparando pedido…');
      const message = buildMessage(cart, customer, settings);
      saveDraft({ ...customer, address: String(form.elements.address.value || '').trim() });
      if (settings.checkout_behavior === 'clear') {
        clearCart();
        localStorage.removeItem(DRAFT_KEY);
      }
      location.href = `https://wa.me/${encodeURIComponent(whatsapp)}?text=${encodeURIComponent(message)}`;
    } catch (error) {
      console.error(error);
      renderStatus('error', 'No pudimos verificar el pedido. Tus datos siguen guardados; revisa tu conexión e intenta nuevamente.');
      toast('No pudimos verificar el pedido. Intenta nuevamente.', 'error');
    } finally {
      submitting = false;
      setCheckoutLoading(false);
    }
  });
}

function configurePickup(settings) {
  const address = String(settings.address || '').trim();
  const city = String(settings.city || '').trim();
  $('#pickup-choice-copy').textContent = address || city || 'La tienda confirmará el punto de recogida';
  $('#pickup-address').textContent = address || 'Dirección por confirmar';
  $('#pickup-city').textContent = city;
  const map = $('#pickup-map');
  const mapsUrl = safeExternalUrl(settings.maps_url);
  map.hidden = !mapsUrl;
  if (mapsUrl) map.href = mapsUrl;
}

function renderPaymentMethods(methods, selected = '') {
  const root = $('#payment-methods');
  if (!methods.length) {
    root.tabIndex = -1;
    root.innerHTML = '<div class="checkout-payment-empty" role="alert"><strong>No hay métodos de pago configurados.</strong><span>Contacta a la tienda para continuar.</span></div>';
    return;
  }
  root.removeAttribute('tabindex');
  root.innerHTML = methods.map(method => `<label class="checkout-choice checkout-choice--payment">
    <input type="radio" name="payment" value="${escapeHtml(method.name)}" required ${method.name === selected ? 'checked' : ''}>
    ${paymentMethodMark(method)}
    <span><strong>${escapeHtml(method.name)}</strong><small>${escapeHtml(method.instructions || 'La tienda confirmará los detalles por WhatsApp.')}</small></span>
    <span class="checkout-choice__check" aria-hidden="true">✓</span>
  </label>`).join('');
}

function paymentMethodMark(method) {
  if (method.logo_url) return `<span class="checkout-payment-icon checkout-payment-icon--logo" aria-hidden="true"><img src="${escapeHtml(localAsset(method.logo_url))}" alt=""></span>`;
  return `<span class="checkout-payment-icon" aria-hidden="true">${escapeHtml(paymentInitials(method.name))}</span>`;
}

function bindDraftPersistence(form) {
  const persist = debounce(() => saveDraft(draftFormData(form)), 180);
  form.addEventListener('input', event => {
    clearFieldError(event.target.name);
    persist();
  });
  form.addEventListener('change', event => {
    clearFieldError(event.target.name);
    if (event.target.name === 'delivery') {
      updateDelivery(event.target.value);
      renderSummary(getCart(), event.target.value);
    }
    persist();
  });
}

function bindValidation(form, methods) {
  ['fullName', 'phone', 'city', 'address'].forEach(name => {
    form.elements[name]?.addEventListener('blur', () => validateField(form, name));
  });
  if (!methods.length) setFieldError(form, 'payment', 'No hay métodos de pago configurados. Contacta a la tienda.');
}

function updateDelivery(delivery, settings = null) {
  const needsShippingData = DELIVERY_WITH_ADDRESS.has(delivery);
  const cityField = $('#city-field');
  const cityInput = $('#checkout-city');
  const addressField = $('#address-field');
  const addressInput = $('#checkout-address');
  const pickup = $('#pickup-information');
  const note = $('#delivery-note');
  cityField.hidden = !needsShippingData;
  cityInput.required = needsShippingData;
  addressField.hidden = !needsShippingData;
  addressInput.required = needsShippingData;
  pickup.hidden = delivery !== 'Recoger en tienda';
  note.hidden = !delivery || delivery === 'Recoger en tienda';
  note.textContent = delivery === 'Envío nacional'
    ? 'El costo y la transportadora se confirmarán contigo por WhatsApp.'
    : delivery === 'Domicilio'
      ? 'La cobertura y el costo del domicilio se confirmarán por WhatsApp.'
      : '';
  if (!needsShippingData) {
    clearFieldError('city');
    clearFieldError('address');
  }
  if (settings) configurePickup(settings);
}

function validateForm(form, methods, focusFirst = false) {
  const needsShippingData = DELIVERY_WITH_ADDRESS.has(form.elements.delivery.value);
  const fields = ['fullName', 'phone', 'delivery', ...(needsShippingData ? ['city', 'address'] : []), 'payment'];
  let firstInvalid = null;
  let valid = true;
  fields.forEach(name => {
    if (!validateField(form, name, methods)) {
      valid = false;
      if (!firstInvalid) firstInvalid = fieldTarget(form, name) || $(`#${name}-error`)?.closest('.checkout-section');
    }
  });
  if (firstInvalid && focusFirst) {
    firstInvalid.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    window.setTimeout(() => firstInvalid.focus({ preventScroll: true }), 220);
  }
  return valid;
}

function validateField(form, name, methods = null) {
  const value = name === 'delivery' || name === 'payment'
    ? form.elements[name]?.value || ''
    : String(form.elements[name]?.value || '').trim();
  let message = '';
  if (name === 'fullName' && value.length < 2) message = 'Ingresa tu nombre completo.';
  if (name === 'phone') {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) message = 'Ingresa un número de teléfono válido.';
  }
  if (name === 'delivery' && !value) message = 'Selecciona un método de entrega.';
  if (name === 'city' && DELIVERY_WITH_ADDRESS.has(form.elements.delivery.value) && value.length < 2) message = 'Ingresa tu ciudad.';
  if (name === 'address' && DELIVERY_WITH_ADDRESS.has(form.elements.delivery.value) && value.length < 5) message = 'Ingresa una dirección de entrega válida.';
  if (name === 'payment' && (!value || (methods && !methods.length))) message = methods && !methods.length ? 'No hay métodos de pago configurados. Contacta a la tienda.' : 'Selecciona un método de pago.';
  setFieldError(form, name, message);
  return !message;
}

function setFieldError(form, name, message) {
  const error = $(`#${name}-error`);
  if (error) error.textContent = message;
  const target = fieldTarget(form, name);
  const group = target?.closest('.checkout-choice-group');
  if (name === 'delivery' || name === 'payment') {
    group?.classList.toggle('has-error', Boolean(message));
    [...form.querySelectorAll(`[name="${name}"]`)].forEach(input => input.setAttribute('aria-invalid', String(Boolean(message))));
  } else if (target) {
    target.setAttribute('aria-invalid', String(Boolean(message)));
    target.closest('.checkout-field')?.classList.toggle('has-error', Boolean(message));
  }
}

function clearFieldError(name) {
  const form = $('#checkout-form');
  if (form && name) setFieldError(form, name, '');
}

function fieldTarget(form, name) {
  if (name === 'delivery') return form.querySelector('[name="delivery"]');
  if (name === 'payment') return form.querySelector('[name="payment"]') || $('#payment-methods');
  return form.elements[name];
}

function normalizedFormData(form) {
  const data = Object.fromEntries(new FormData(form));
  const needsShippingData = DELIVERY_WITH_ADDRESS.has(data.delivery);
  return {
    fullName: String(data.fullName || '').trim().replace(/\s+/g, ' '),
    phone: String(data.phone || '').trim(),
    city: needsShippingData ? String(data.city || '').trim().replace(/\s+/g, ' ') : '',
    delivery: String(data.delivery || ''),
    address: needsShippingData ? String(data.address || '').trim().replace(/\s+/g, ' ') : '',
    payment: String(data.payment || ''),
    notes: String(data.notes || '').trim()
  };
}

function draftFormData(form) {
  return {
    ...normalizedFormData(form),
    city: String(form.elements.city.value || '').trim(),
    address: String(form.elements.address.value || '').trim()
  };
}

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : {};
  } catch { return {}; }
}

function saveDraft(values) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(values)); } catch { /* El checkout sigue funcionando sin persistencia. */ }
}

function restoreDraft(form, draft) {
  ['fullName', 'phone', 'city', 'address', 'notes'].forEach(name => {
    if (typeof draft[name] === 'string' && form.elements[name]) form.elements[name].value = draft[name];
  });
  ['delivery', 'payment'].forEach(name => {
    if (!draft[name]) return;
    const option = [...form.querySelectorAll(`[name="${name}"]`)].find(input => input.value === draft[name]);
    if (option) option.checked = true;
  });
}

function renderSummary(cart, delivery = '') {
  const units = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const productsTotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const personalizationTotal = cart.reduce((sum, item) => sum + Number(item.personalization_price || 0) * Number(item.quantity || 0), 0);
  const total = productsTotal + personalizationTotal;
  const countText = `${units} producto${units === 1 ? '' : 's'}`;
  const items = cart.map(summaryItemMarkup).join('');
  const shipping = shippingCopy(delivery);

  $('#checkout-mobile-count').textContent = countText;
  $('#checkout-desktop-count').textContent = countText;
  $('#checkout-mobile-total').textContent = formatMoney(total);
  $('#checkout-mobile-confirm-total').textContent = formatMoney(total);
  $('#checkout-desktop-total').textContent = formatMoney(total);
  $('#checkout-sticky-total').textContent = formatMoney(total);
  $('#checkout-products-label').textContent = personalizationTotal ? `Productos y personalización (${units})` : `Productos (${units})`;
  $('#checkout-products-total').textContent = formatMoney(total);
  $('#checkout-mobile-products').innerHTML = items;
  $('#checkout-desktop-products').innerHTML = items;
  $('#checkout-mobile-shipping').textContent = shipping;
  $('#checkout-desktop-shipping').textContent = shipping;
}

function summaryItemMarkup(item) {
  const quantity = Number(item.quantity || 0);
  const unit = Number(item.price || 0) + Number(item.personalization_price || 0);
  const custom = personalizationSummary(item.personalization);
  const image = item.image || 'assets/images/product-white.svg';
  return `<article class="checkout-order-item">
    <img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy">
    <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.color || 'Color')} · ${escapeHtml(item.size || 'Talla')} · Cant. ${quantity}</span>${custom ? `<small>${escapeHtml(custom)}</small>` : ''}</div>
    <strong>${formatMoney(unit * quantity)}</strong>
  </article>`;
}

function personalizationSummary(custom) {
  if (!custom) return '';
  return [custom.name, custom.number && `#${custom.number}`, custom.logoUrl && 'Logo ✓'].filter(Boolean).join(' · ');
}

function shippingCopy(delivery) {
  if (delivery === 'Envío nacional') return 'Envío: costo y transportadora se confirman por WhatsApp.';
  if (delivery === 'Domicilio') return 'Domicilio: cobertura y costo se confirman por WhatsApp.';
  if (delivery === 'Recoger en tienda') return 'Recogida en tienda: confirmaremos cuándo esté listo.';
  return 'La entrega se confirma por WhatsApp.';
}

function humanizeAvailability(reason) {
  return String(reason || 'Ya no está disponible.').replace(/\b1 unidades\b/i, '1 unidad');
}

function renderStatus(type, message, actionLabel = '', actionHref = '', shouldScroll = true) {
  const root = $('#checkout-status');
  root.hidden = false;
  root.className = `checkout-status checkout-status--${type}`;
  root.innerHTML = `<span aria-hidden="true">${type === 'error' ? '!' : 'i'}</span><div><strong>${type === 'error' ? 'Revisa tu pedido' : 'Información del pedido'}</strong><p>${escapeHtml(message)}</p>${actionHref ? `<a href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>` : ''}</div>`;
  if (shouldScroll) root.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
}

function setCheckoutLoading(loading, label = '') {
  document.querySelectorAll('.checkout-submit,.checkout-sticky__button').forEach(button => {
    if (loading) {
      button.dataset.originalHtml ||= button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${escapeHtml(label)}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  });
}

function bindStickyAction() {
  const sticky = $('#checkout-sticky');
  const primary = $('#checkout-primary-action');
  sticky.hidden = false;
  if (!('IntersectionObserver' in window) || !primary) return;
  const observer = new IntersectionObserver(([entry]) => sticky.classList.toggle('is-hidden', entry.isIntersecting), { threshold: .15 });
  observer.observe(primary);
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function buildMessage(cart, customer, settings) {
  const lines = [`⚽ *NUEVO PEDIDO — ${String(settings.business_name || 'Fuera de Lugar Sport').toUpperCase()}*`, '', '👤 *CLIENTE*', `Nombre: ${customer.fullName}`, `Teléfono: ${customer.phone}`, customer.city ? `Ciudad: ${customer.city}` : '', '', '🚚 *ENTREGA*', `Método: ${customer.delivery}`, customer.address ? `Dirección: ${customer.address}` : '', '', '💳 *PAGO*', `Método preferido: ${customer.payment}`, '', '──────────────'];
  cart.forEach((item, index) => {
    const unit = Number(item.price) + Number(item.personalization_price || 0);
    lines.push('', `*PRODUCTO ${index + 1}*`, item.name, `Color: ${item.color}`, `Talla: ${item.size}`, `Cantidad: ${item.quantity}`, `Precio unitario: ${formatMoney(unit)}`);
    const custom = item.personalization;
    if (custom) {
      if (custom.name) lines.push(`Nombre: ${custom.name}`);
      if (custom.number) lines.push(`Número: ${custom.number}`);
      if (custom.font) lines.push(`Fuente: ${custom.font}`);
      if (custom.textColor) lines.push(`Color texto: ${custom.textColor}`);
      if (custom.namePosition) lines.push(`Posición nombre: ${custom.namePosition}`);
      if (custom.numberPosition) lines.push(`Posición número: ${custom.numberPosition}`);
      if (custom.logoPosition) lines.push(`Posición logo: ${custom.logoPosition}`);
      if (custom.logoUrl) lines.push(`Logo: ${custom.logoUrl}`);
    }
    lines.push(`Subtotal: ${formatMoney(unit * item.quantity)}`, `Producto: ${new URL(`producto.html?slug=${encodeURIComponent(item.slug)}`, location.href).href}`);
  });
  const total = cart.reduce((sum, item) => sum + (Number(item.price) + Number(item.personalization_price || 0)) * item.quantity, 0);
  lines.push('', '──────────────', `*TOTAL: ${formatMoney(total)}*`, customer.notes ? `Observaciones: ${customer.notes}` : '', '', 'Por favor confirmar disponibilidad, entrega y datos de pago.');
  return lines.filter(line => line !== '').join('\n');
}
