import { getProductBySlug, getProducts, uploadImage } from '../lib/api.js';
import { renderProducts } from '../components/product-card.js';
import { createProductCustomizer } from '../components/product-customizer.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { $, $$, currentPrice, discountPercent, escapeHtml, formatMoney, getCategoryUrl, isPromoActive, localAsset, params, productImage, routeSlug, sharePage, setButtonLoading } from '../lib/helpers.js';
import { addCartItem, getCart, isFavorite, toggleFavorite, updateCartLine } from '../lib/store.js';

const icons = {
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.7 10.7 6.6-4.2M8.7 13.3l6.6 4.2"></path></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.7a5.4 5.4 0 0 0-7.7 0L12 5.8l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.6a5.4 5.4 0 0 0 0-7.7Z"></path></svg>',
  zoom: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4M11 8v6M8 11h6"></path></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c.7 5.5 4.5 9.3 10 10-5.5.7-9.3 4.5-10 10-.7-5.5-4.5-9.3-10-10 5.5-.7 9.3-4.5 10-10Z"></path></svg>'
};

function productInformationMarkup(product) {
  const paragraph = value => escapeHtml(String(value || '').trim()).replace(/\r?\n/g, '<br>');
  const sections = [];
  if (String(product.description || '').trim()) {
    sections.push(['description-panel', 'Detalles del producto', `<p>${paragraph(product.description)}</p>`]);
  }
  const material = String(product.material || '').trim();
  const care = String(product.care_instructions || '').trim();
  if (material || care) {
    const content = `${material ? `<p><strong>Material:</strong><br>${paragraph(material)}</p>` : ''}${care ? `<p><strong>Cuidados:</strong><br>${paragraph(care)}</p>` : ''}`;
    sections.push(['material-panel', 'Material y cuidados', content]);
  }
  if (String(product.purchase_delivery_info || '').trim()) {
    sections.push(['delivery-panel', 'Compra y entrega', `<p>${paragraph(product.purchase_delivery_info)}</p>`]);
  }
  if (!sections.length) return '';
  return `<div class="product-accordions" id="product-details">${sections.map(([id, title, content]) => `<section><button type="button" aria-expanded="false" aria-controls="${id}">${title} <span aria-hidden="true">+</span></button><div id="${id}" hidden>${content}</div></section>`).join('')}</div>`;
}

export async function initProduct() {
  const slug = routeSlug();
  if (!slug) throw new Error('Producto no indicado');
  const product = await getProductBySlug(slug);
  document.title = `${product.name} | Fuera de Lugar Sport`;
  const canCustomize = product.is_personalizable === true && Boolean(product.allow_name || product.allow_number || product.allow_logo);

  const colors = (product.product_colors || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const sizes = (product.product_sizes || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const editLineId = params().get('edit');
  const editCandidate = editLineId ? getCart().find(item => item.line_id === editLineId) : null;
  const editing = editCandidate?.product_id === product.id ? editCandidate : null;
  let selectedColor = colors.find(item => item.id === editing?.color_id) || colors[0] || null;
  let selectedSize = sizes.find(item => item.id === editing?.size_id) || firstAvailableSize();
  let quantity = Math.max(1, Number(editing?.quantity || 1));
  let galleryImages = [];
  let galleryIndex = 0;
  let mainCtaSeen = false;

  function variantFor(colorId, sizeId) {
    return (product.product_variants || []).find(variant => variant.color_id === colorId && variant.size_id === sizeId && variant.active);
  }

  function firstAvailableSize() {
    return sizes.find(size => Number(variantFor(selectedColor?.id, size.id)?.stock) > 0 && !product.force_sold_out) || null;
  }

  const primaryCategory = product.product_categories?.[0]?.categories;
  $('#product-breadcrumbs').innerHTML = `<a href="index.html">Inicio</a><span aria-hidden="true">›</span>${primaryCategory ? `<a href="${getCategoryUrl(primaryCategory.slug)}">${escapeHtml(primaryCategory.name)}</a><span aria-hidden="true">›</span>` : ''}<span aria-current="page">${escapeHtml(product.teams?.name || product.name)}</span>`;

  const promo = isPromoActive(product);
  const root = $('#product-detail');
  root.classList.remove('skeleton-grid');
  root.innerHTML = `<section class="gallery" aria-label="Galería del producto">
      <div class="gallery__main">
        <button id="gallery-zoom" class="gallery__zoom-target" type="button" aria-label="Ampliar imagen de ${escapeHtml(product.name)}">
          <img id="main-product-image" src="${escapeHtml(productImage(product, selectedColor?.id))}" alt="${escapeHtml(product.name)}" fetchpriority="high">
          <span class="gallery__zoom-hint">${icons.zoom}<span>Ampliar</span></span>
        </button>
        <div class="gallery__actions">
          <button id="share-product" type="button" aria-label="Compartir producto">${icons.share}</button>
          <button id="product-favorite" class="${isFavorite(product.id) ? 'active' : ''}" type="button" aria-label="${isFavorite(product.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}">${icons.heart}</button>
        </div>
        <span id="gallery-count" class="gallery__count" aria-live="polite"></span>
      </div>
      <div id="gallery-track" class="gallery__track" aria-label="Imágenes disponibles"></div>
    </section>
    <section class="product-info">
      <div class="product-info__meta">${escapeHtml(product.teams?.name || product.brands?.name || 'Fuera de Lugar Sport')}</div>
      <h1>${escapeHtml(product.name)}</h1>
      <div class="price product-price"><strong>${formatMoney(currentPrice(product))}</strong>${promo ? `<del>${formatMoney(product.base_price)}</del><span class="discount-badge discount-badge--inline">-${discountPercent(product)}%</span>` : ''}</div>
      ${product.description ? `<p class="product-description">${escapeHtml(product.description)}</p>${product.description.length > 125 ? '<button class="product-details-link" data-scroll-details type="button">Ver detalles</button>' : ''}` : ''}
      ${colors.length ? `<div class="option-group" id="color-group"><div class="option-group__head"><strong>Color</strong><span id="selected-color">${escapeHtml(selectedColor?.name || '')}</span></div><div id="color-options" class="swatches">${colors.map(color => colorButtonMarkup(color, selectedColor)).join('')}</div><p class="option-error" id="color-error" hidden>Selecciona un color.</p></div>` : ''}
      <div class="option-group" id="size-group"><div class="option-group__head"><strong>Talla</strong>${product.size_guide_text || product.size_guide_image_url ? '<button id="size-guide" class="link-button" type="button">Guía de tallas</button>' : ''}</div><div id="size-options" class="size-options"></div><p class="option-error" id="size-error" hidden>Selecciona una talla.</p></div>
      <div id="stock-status" class="stock-status" role="status"></div>
      ${canCustomize ? '<div id="personalization-card"></div>' : ''}
      <div class="quantity-row"><strong>Cantidad</strong><div class="quantity"><button id="qty-minus" type="button" aria-label="Restar cantidad">−</button><input id="quantity" type="number" inputmode="numeric" min="1" value="${quantity}" aria-label="Cantidad"><button id="qty-plus" type="button" aria-label="Sumar cantidad">+</button></div></div>
      <div id="purchase-total" class="purchase-total" hidden></div>
      <div class="product-actions"><button id="add-cart" class="btn btn--primary btn--block" type="button"></button></div>
      ${productInformationMarkup(product)}
    </section>`;

  document.querySelector('#product-sticky-buy')?.remove();
  root.insertAdjacentHTML('afterend', '<div id="product-sticky-buy" class="product-sticky-buy" hidden><span><small>Total</small><strong></strong></span><button type="button">Agregar</button></div>');

  const customizer = canCustomize ? createProductCustomizer({
    product,
    initialState: editing?.personalization,
    onApply: () => {
      renderPersonalizationCard();
      updatePriceSummary();
    }
  }) : null;

  function colorButtonMarkup(color, selected) {
    const active = color.id === selected?.id;
    const swatch = color.hex_code ? ` style="--swatch:${escapeHtml(color.hex_code)}"` : '';
    return `<button class="swatch ${color.hex_code ? '' : 'swatch--name-only'} ${active ? 'active' : ''}"${swatch} data-color="${color.id}" type="button" aria-pressed="${active}"><span>${escapeHtml(color.name)}</span></button>`;
  }

  function filteredImages() {
    const all = (product.product_images || []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
    const byColor = all.filter(image => image.color_id === selectedColor?.id);
    const general = all.filter(image => !image.color_id);
    return selectedColor && byColor.length ? [...byColor, ...general] : general.length ? general : all;
  }

  function updateGallery() {
    galleryImages = filteredImages();
    if (!galleryImages.length) galleryImages = [{ url: productImage(product, selectedColor?.id), alt_text: product.name }];
    galleryIndex = 0;
    const track = $('#gallery-track');
    track.innerHTML = galleryImages.map((image, index) => `<button class="gallery__thumb ${index === 0 ? 'active' : ''}" data-image="${index}" type="button" aria-label="Ver imagen ${index + 1} de ${galleryImages.length}" aria-current="${index === 0 ? 'true' : 'false'}"><img src="${escapeHtml(localAsset(image.url))}" alt="" loading="lazy"></button>`).join('');
    track.hidden = galleryImages.length < 2;
    showImage(0);
  }

  function showImage(index) {
    if (!galleryImages.length) return;
    galleryIndex = (index + galleryImages.length) % galleryImages.length;
    const image = galleryImages[galleryIndex];
    const main = $('#main-product-image');
    main.classList.remove('is-changing');
    requestAnimationFrame(() => main.classList.add('is-changing'));
    main.src = localAsset(image.url);
    main.alt = image.alt_text || `${product.name}, imagen ${galleryIndex + 1}`;
    $('#gallery-count').textContent = `${galleryIndex + 1} / ${galleryImages.length}`;
    $$('.gallery__thumb', $('#gallery-track')).forEach((element, indexValue) => {
      const active = indexValue === galleryIndex;
      element.classList.toggle('active', active);
      element.setAttribute('aria-current', String(active));
    });
  }

  function openLightbox(trigger) {
    let index = galleryIndex;
    const wrapper = document.createElement('div');
    wrapper.className = `lightbox${galleryImages.length < 2 ? ' lightbox--single' : ''}`;
    wrapper.innerHTML = `<button class="lightbox__nav lightbox__nav--prev" type="button" aria-label="Imagen anterior">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="lightbox__nav lightbox__nav--next" type="button" aria-label="Imagen siguiente">›</button>`;
    let keyHandler;
    openModal({ title: product.name, content: wrapper, className: 'modal--lightbox', trigger, onClose: () => document.removeEventListener('keydown', keyHandler) });
    const draw = () => {
      const image = galleryImages[index];
      wrapper.querySelector('img').src = localAsset(image.url);
      wrapper.querySelector('img').alt = image.alt_text || product.name;
      wrapper.querySelector('figcaption').textContent = `${index + 1} / ${galleryImages.length}`;
      wrapper.querySelectorAll('.lightbox__nav').forEach(button => { button.hidden = galleryImages.length < 2; });
    };
    wrapper.addEventListener('click', event => {
      if (event.target.closest('.lightbox__nav--prev')) index = (index - 1 + galleryImages.length) % galleryImages.length;
      if (event.target.closest('.lightbox__nav--next')) index = (index + 1) % galleryImages.length;
      draw();
    });
    keyHandler = event => {
      if (event.key === 'ArrowLeft') { index = (index - 1 + galleryImages.length) % galleryImages.length; draw(); }
      if (event.key === 'ArrowRight') { index = (index + 1) % galleryImages.length; draw(); }
    };
    document.addEventListener('keydown', keyHandler);
    draw();
  }

  function renderSizes() {
    const selectedVariant = variantFor(selectedColor?.id, selectedSize?.id);
    if (!selectedVariant || Number(selectedVariant.stock) <= 0 || product.force_sold_out) selectedSize = firstAvailableSize();
    $('#size-options').innerHTML = sizes.map(size => {
      const variant = variantFor(selectedColor?.id, size.id);
      const disabled = !variant || Number(variant.stock) <= 0 || product.force_sold_out;
      const active = size.id === selectedSize?.id && !disabled;
      return `<button class="size-button ${active ? 'active' : ''}" data-size="${size.id}" type="button" aria-pressed="${active}" ${disabled ? `disabled aria-label="${escapeHtml(size.name)}, agotada"` : ''}>${escapeHtml(size.name)}</button>`;
    }).join('');
  }

  function updateStock() {
    const variant = variantFor(selectedColor?.id, selectedSize?.id);
    const stock = product.force_sold_out ? 0 : Number(variant?.stock || 0);
    const status = $('#stock-status');
    status.className = 'stock-status';
    if (!stock) {
      status.classList.add('stock-status--sold');
      status.innerHTML = '<span aria-hidden="true"></span> Agotado en esta combinación';
    } else if (product.force_last_units || stock <= 3) {
      status.classList.add('stock-status--low');
      status.innerHTML = `<span aria-hidden="true"></span> Últimas ${stock} unidad${stock === 1 ? '' : 'es'}`;
    } else {
      status.innerHTML = '<span aria-hidden="true"></span> Disponible';
    }
    $('#quantity').max = Math.max(stock, 1);
    quantity = Math.max(1, Math.min(quantity, Math.max(stock, 1)));
    $('#quantity').value = quantity;
    updatePriceSummary();
  }

  function customizationSummary() {
    const state = customizer?.getValue();
    if (!state || !customizer.hasCustomization()) return '';
    const identity = [state.name && escapeHtml(state.name.toUpperCase()), state.number && `#${escapeHtml(state.number)}`].filter(Boolean).join(' · ');
    const colorName = ({ '#ffffff': 'Blanco', '#111612': 'Negro', '#d4af37': 'Dorado', '#c0c0c0': 'Plateado', '#c83434': 'Rojo' })[state.textColor] || 'Personalizado';
    return `<span class="personalization-card__label">Personalización</span><strong>${identity || 'Logo personalizado'}</strong><small>${state.font ? `${escapeHtml(state.font)} · ${colorName}` : colorName}${state.logoUrl || customizer.getLogoFile() ? ' · Logo ✓' : ''}</small>`;
  }

  function renderPersonalizationCard() {
    if (!customizer) return;
    const target = $('#personalization-card');
    const customized = customizer.hasCustomization();
    const price = Number(product.personalization_price || 0);
    const availableOptions=[product.allow_name?'nombre':'',product.allow_number?'número':'',product.allow_logo?'logo':''].filter(Boolean);
    const optionsLabel=availableOptions.length>1?`${availableOptions.slice(0,-1).join(', ')} y ${availableOptions.at(-1)}`:availableOptions[0]||'';
    target.innerHTML = `<section class="personalization-card ${customized ? 'is-applied' : ''}"><div class="personalization-card__icon">${icons.spark}</div><div class="personalization-card__copy">${customized ? customizationSummary() : `<strong>Personaliza tu uniforme</strong><span>${escapeHtml(optionsLabel.charAt(0).toUpperCase()+optionsLabel.slice(1))}</span><small>Opcional${price ? ` · +${formatMoney(price)}` : ''}</small>`}</div><button type="button" id="open-customizer">${customized ? 'Editar' : 'Personalizar'}</button></section>`;
    $('#open-customizer').addEventListener('click', event => customizer.open(event.currentTarget));
  }

  function updatePriceSummary() {
    const variant = variantFor(selectedColor?.id, selectedSize?.id);
    const stock = product.force_sold_out ? 0 : Number(variant?.stock || 0);
    const base = currentPrice(product);
    const customPrice = customizer?.hasCustomization() ? Number(product.personalization_price || 0) : 0;
    const unit = base + customPrice;
    const total = unit * quantity;
    const summary = $('#purchase-total');
    summary.hidden = !customPrice && quantity === 1;
    summary.innerHTML = `<div><span>Producto</span><strong>${formatMoney(base)}</strong></div>${customPrice ? `<div><span>Personalización</span><strong>+${formatMoney(customPrice)}</strong></div>` : ''}<div class="purchase-total__final"><span>${quantity > 1 ? `${quantity} × ${formatMoney(unit)}` : 'Total unidad'}</span><strong>${formatMoney(total)}</strong></div>`;
    const cta = $('#add-cart');
    cta.disabled = !stock;
    cta.textContent = !stock ? 'Agotado' : `${editing ? 'Actualizar carrito' : 'Agregar al carrito'} · ${formatMoney(total)}`;
    const sticky = $('#product-sticky-buy');
    sticky.querySelector('strong').textContent = formatMoney(total);
    sticky.querySelector('button').disabled = !stock;
    sticky.querySelector('button').textContent = !stock ? 'Agotado' : editing ? 'Actualizar' : 'Agregar';
  }

  function chooseColor(button) {
    selectedColor = colors.find(color => color.id === button.dataset.color) || null;
    selectedSize = firstAvailableSize();
    $$('.swatch', $('#color-options')).forEach(element => {
      const active = element === button;
      element.classList.toggle('active', active);
      element.setAttribute('aria-pressed', String(active));
    });
    $('#selected-color').textContent = selectedColor?.name || '';
    if ($('#color-error')) $('#color-error').hidden = true;
    customizer?.setTemplates({ front: selectedColor?.front_template_url, back: selectedColor?.back_template_url });
    updateGallery();
    renderSizes();
    updateStock();
  }

  $('#color-options')?.addEventListener('click', event => {
    const button = event.target.closest('[data-color]');
    if (button) chooseColor(button);
  });
  $('#size-options').addEventListener('click', event => {
    const button = event.target.closest('[data-size]');
    if (!button || button.disabled) return;
    selectedSize = sizes.find(size => size.id === button.dataset.size) || null;
    $('#size-error').hidden = true;
    renderSizes();
    updateStock();
  });
  $('#gallery-track').addEventListener('click', event => {
    const button = event.target.closest('[data-image]');
    if (button) showImage(Number(button.dataset.image));
  });
  $('#gallery-zoom').addEventListener('click', event => openLightbox(event.currentTarget));

  let touchX = 0;
  $('.gallery__main').addEventListener('touchstart', event => { touchX = event.touches[0].clientX; }, { passive: true });
  $('.gallery__main').addEventListener('touchend', event => {
    const delta = event.changedTouches[0].clientX - touchX;
    if (Math.abs(delta) > 45 && galleryImages.length > 1) showImage(galleryIndex + (delta < 0 ? 1 : -1));
  }, { passive: true });

  $('#qty-minus').addEventListener('click', () => {
    quantity = Math.max(1, quantity - 1);
    $('#quantity').value = quantity;
    updatePriceSummary();
  });
  $('#qty-plus').addEventListener('click', () => {
    const max = Number($('#quantity').max || 1);
    if (quantity >= max) { toast(`Solo quedan ${max} unidades`, 'error'); return; }
    quantity += 1;
    $('#quantity').value = quantity;
    updatePriceSummary();
  });
  $('#quantity').addEventListener('change', event => {
    const max = Number(event.target.max || 1);
    const requested = Math.max(1, Number(event.target.value) || 1);
    quantity = Math.min(max, requested);
    event.target.value = quantity;
    if (requested > max) toast(`Solo quedan ${max} unidades`, 'error');
    updatePriceSummary();
  });

  $('#product-favorite').addEventListener('click', event => {
    const active = toggleFavorite(product.id);
    event.currentTarget.classList.toggle('active', active);
    event.currentTarget.setAttribute('aria-label', active ? 'Quitar de favoritos' : 'Agregar a favoritos');
    toast(active ? 'Guardado en favoritos' : 'Eliminado de favoritos');
  });
  $('#share-product').addEventListener('click', async () => {
    const result = await sharePage({ title: product.name, text: `Mira ${product.name} por ${formatMoney(currentPrice(product))}` });
    if (result === 'copied') toast('Enlace copiado');
  });
  $('#size-guide')?.addEventListener('click', event => openModal({ title: 'Guía de tallas', trigger: event.currentTarget, className: 'modal--size-guide', content: `<div class="size-guide"><p>${escapeHtml(product.size_guide_text || '')}</p>${product.size_guide_image_url ? `<img src="${escapeHtml(localAsset(product.size_guide_image_url))}" alt="Guía de tallas">` : ''}</div>` }));
  $('[data-scroll-details]')?.addEventListener('click', () => {
    const button = $('#product-details button');
    if (button.getAttribute('aria-expanded') !== 'true') button.click();
    $('#product-details').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('.product-accordions')?.addEventListener('click', event => {
    const button = event.target.closest('button[aria-controls]');
    if (!button) return;
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    button.querySelector('span').textContent = expanded ? '+' : '−';
    panel.hidden = expanded;
  });

  async function addToCart() {
    if (!selectedColor && colors.length) return showOptionError('color');
    if (!selectedSize) return showOptionError('size');
    const variant = variantFor(selectedColor?.id, selectedSize.id);
    if (!variant || Number(variant.stock) < quantity || product.force_sold_out) {
      toast(Number(variant?.stock) ? `Solo quedan ${variant.stock} unidades` : 'Selecciona una combinación disponible', 'error');
      return;
    }
    const button = $('#add-cart');
    setButtonLoading(button, true, 'Guardando…');
    try {
      let personalization = null;
      let personalizationPrice = 0;
      if (customizer?.hasCustomization()) {
        const file = customizer.getLogoFile();
        if (file) {
          const logoUrl = await uploadImage('customer-customizations', file, 'uploads');
          customizer.setPersistedLogoUrl(logoUrl);
        }
        personalization = customizer.getValue();
        personalizationPrice = Number(product.personalization_price || 0);
      }
      const item = {
        product_id: product.id,
        variant_id: variant.id,
        name: product.name,
        slug: product.slug,
        image: productImage(product, selectedColor?.id),
        color_id: selectedColor?.id,
        color: selectedColor?.name,
        size_id: selectedSize.id,
        size: selectedSize.name,
        quantity,
        stock: Number(variant.stock),
        price: currentPrice(product),
        personalization,
        personalization_price: personalizationPrice
      };
      if (editing) updateCartLine(editLineId, item);
      else addCartItem(item);
      toast(editing ? 'Carrito actualizado' : 'Producto agregado al carrito');
      if (editing) setTimeout(() => { location.href = 'carrito.html'; }, 350);
    } catch (error) {
      console.error(error);
      toast(customizer?.getLogoFile() ? 'No pudimos cargar el logo. Intenta nuevamente.' : 'No pudimos guardar el producto. Intenta nuevamente.', 'error');
    } finally {
      if (!editing) {
        setButtonLoading(button, false);
        updatePriceSummary();
      }
    }
  }

  function showOptionError(type) {
    const group = $(`#${type}-group`);
    const error = $(`#${type}-error`);
    if (error) error.hidden = false;
    group?.classList.add('option-group--error');
    group?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => group?.classList.remove('option-group--error'), 1800);
    toast(`Selecciona un${type === 'size' ? 'a talla' : ' color'}.`, 'error');
  }

  $('#add-cart').addEventListener('click', addToCart);
  $('#product-sticky-buy button').addEventListener('click', () => $('#add-cart').click());

  if ('IntersectionObserver' in window) {
    const sticky = $('#product-sticky-buy');
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) mainCtaSeen = true;
      const passedAbove = entry.boundingClientRect.top < 0;
      const show = mainCtaSeen && !entry.isIntersecting && passedAbove;
      sticky.hidden = !show;
      document.body.classList.toggle('product-sticky-visible', show);
    }, { threshold: 0.1 });
    observer.observe($('#add-cart'));
  }

  updateGallery();
  renderSizes();
  renderPersonalizationCard();
  updateStock();
  loadRelated(product, primaryCategory?.id);
}

async function loadRelated(product, categoryId) {
  try {
    const { products } = await getProducts({ teamId: product.team_id || undefined, categoryId: product.team_id ? undefined : categoryId, pageSize: 6 });
    const related = products.filter(item => item.id !== product.id).slice(0, 5);
    if (related.length) {
      $('#related-section').hidden = false;
      renderProducts($('#related-products'), related);
    }
  } catch (error) {
    console.error(error);
  }
}
