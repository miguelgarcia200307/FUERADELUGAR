import { getSettings } from '../lib/api.js';
import { cartCount, getFavorites } from '../lib/store.js';
import { escapeHtml, localAsset } from '../lib/helpers.js';
import { bindSearch, searchBox } from './search.js';
import { createAnnouncementController, DEFAULT_ANNOUNCEMENT_TEXT, normalizeAnnouncementSettings } from '../lib/announcement.js';

let settingsCache;
export async function loadSettings() {
  if (settingsCache) return settingsCache;
  try {
    settingsCache = await Promise.race([
      getSettings(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Settings timeout')), 2500))
    ]);
  }
  catch (error) {
    console.error(error);
    settingsCache = { business_name: 'Fuera de Lugar Sport', whatsapp: '573023031112', address: 'Calle 17 No. 8 - 46, Centro', city: 'Valledupar - Cesar', instagram: '@fueradelugar_sport', schedule: 'Lunes a sábado', announcement_enabled: true, announcement_mode: 'static', announcement_static_text: DEFAULT_ANNOUNCEMENT_TEXT, announcement_interval_seconds: 5 };
  }
  return settingsCache;
}

const icons = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.7a5.4 5.4 0 0 0-7.7 0L12 5.8l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.6a5.4 5.4 0 0 0 0-7.7Z"></path></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8Z"></path><path d="M9 9V6a3 3 0 0 1 6 0v3"></path></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8"></path><path d="M5 10v11h14V10M9 21v-7h6v7"></path></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>',
  sale: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13 13 20 4 11V4h7l9 9Z"></path><circle cx="8.5" cy="8.5" r="1"></circle><path d="m9 16 6-6"></path></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.6Z"></path><path d="M8.5 8.2c.6 3.1 2.2 4.7 5.3 5.3"></path></svg>',
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r=".5"></circle></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3H4.5C3.7 3 3 3.7 3.1 4.5A17.5 17.5 0 0 0 19.5 21c.8.1 1.5-.6 1.5-1.4v-2.7l-4-1.4-1.1 2a14 14 0 0 1-9.4-9.4l2-1.1-1.3-4Z"></path></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8 12 2.5 2.5L16 9"></path></svg>'
};

const filterIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M14 5v4M4 17h2M10 17h10M10 15v4M4 12h4M12 12h8M8 10v4"></path></svg>';

function homeSearchToolbar(id, mobile = false) {
  return `<div class="home-search-toolbar${mobile ? ' home-search-toolbar--mobile' : ' home-search-toolbar--desktop'}">
    ${searchBox(id, mobile)}
    <button class="home-filter-trigger" type="button" data-home-filter-trigger aria-label="Filtrar productos" title="Filtrar productos" aria-controls="home-filters" aria-expanded="false">
      ${filterIcon}<span class="home-filter-trigger__label">Filtros</span><b data-home-filter-count hidden></b>
    </button>
  </div>`;
}

function brand(settings, { footer = false } = {}) {
  return `<img class="brand__logo${footer ? ' brand__logo--footer' : ''}" src="${localAsset('img/logo.png')}" alt="${escapeHtml(settings.business_name || 'Fuera de Lugar Sport')}" width="1254" height="522">`;
}

function safeExternalUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function whatsappUrl(number, businessName) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '';
  const message = `Hola, quiero información sobre los productos de ${businessName || 'la tienda'}.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function instagramUrl(value) {
  if (!value) return '';
  const directUrl = safeExternalUrl(value);
  if (directUrl) return directUrl;
  const handle = String(value).trim().replace(/^@/, '').replace(/^instagram\.com\//i, '').split(/[/?#]/)[0];
  return handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : '';
}

export function renderFooter(settings) {
  const businessName = settings.business_name || 'Fuera de Lugar Sport';
  const whatsAppHref = whatsappUrl(settings.whatsapp, businessName);
  const instagramHref = instagramUrl(settings.instagram);
  const mapsHref = safeExternalUrl(settings.maps_url);
  const address = String(settings.address || '').trim();
  const city = String(settings.city || '').trim();
  const schedule = String(settings.schedule || '').trim();
  const phone = String(settings.phone || '').trim();
  const phoneHref = phone ? `tel:${phone.replace(/[^+\d]/g, '')}` : '';
  const email = String(settings.email || '').trim();
  const cityName = city.split(/\s+[-–—]\s+/)[0];
  const locationCopy = cityName ? `Tu tienda deportiva en ${cityName}.` : 'Todo para vivir el deporte.';
  const hasVisitDetails = address || city || schedule || mapsHref;

  const contactActions = [
    whatsAppHref ? `<a class="footer-action footer-action--primary" href="${escapeHtml(whatsAppHref)}" target="_blank" rel="noopener" aria-label="Abrir WhatsApp de ${escapeHtml(businessName)}">${icons.whatsapp}<span><strong>WhatsApp</strong><small>Escríbenos ahora</small></span>${icons.arrow}</a>` : '',
    instagramHref ? `<a class="footer-action" href="${escapeHtml(instagramHref)}" target="_blank" rel="noopener" aria-label="Abrir Instagram de ${escapeHtml(businessName)}">${icons.instagram}<span><strong>Instagram</strong><small>${escapeHtml(settings.instagram)}</small></span>${icons.arrow}</a>` : ''
  ].filter(Boolean).join('');

  const directContact = [
    phoneHref ? `<a href="${escapeHtml(phoneHref)}">${icons.phone}<span>${escapeHtml(phone)}</span></a>` : '',
    email ? `<a href="mailto:${escapeHtml(email)}">${icons.mail}<span>${escapeHtml(email)}</span></a>` : ''
  ].filter(Boolean).join('');

  const footerMarkup = `<footer class="site-footer" data-site-footer>
    <div class="footer-main container">
      <div class="footer-grid">
        <section class="footer-section footer-brand" aria-label="${escapeHtml(businessName)}">
          <a class="brand footer-brand__link" href="index.html" aria-label="Ir al inicio">${brand(settings, { footer: true })}</a>
          <p><span>${escapeHtml(locationCopy)}</span><span>Uniformes, calzado y accesorios.</span></p>
        </section>
        ${contactActions || directContact ? `<section class="footer-section footer-contact" aria-labelledby="footer-contact-title"><h2 id="footer-contact-title">Hablemos</h2>${contactActions ? `<div class="footer-actions">${contactActions}</div>` : ''}${directContact ? `<div class="footer-direct">${directContact}</div>` : ''}</section>` : ''}
        <nav class="footer-section footer-explore" aria-labelledby="footer-explore-title"><h2 id="footer-explore-title">Explora</h2><div class="footer-nav-list">
          <a href="catalogo.html"><span>Catálogo</span>${icons.arrow}</a>
          <a href="categorias.html"><span>Categorías</span>${icons.arrow}</a>
          <a href="equipos.html"><span>Equipos</span>${icons.arrow}</a>
          <a href="promociones.html"><span>Promociones</span>${icons.arrow}</a>
        </div></nav>
        ${hasVisitDetails ? `<section class="footer-section footer-visit" aria-labelledby="footer-visit-title"><h2 id="footer-visit-title">Visítanos</h2>${address || city ? `<address class="footer-detail">${icons.pin}<span>${address ? `<strong>${escapeHtml(address)}</strong>` : ''}${city ? `<small>${escapeHtml(city)}</small>` : ''}</span></address>` : ''}${schedule ? `<div class="footer-detail">${icons.clock}<span><small>Horario</small><strong>${escapeHtml(schedule)}</strong></span></div>` : ''}${mapsHref ? `<a class="footer-map-link" href="${escapeHtml(mapsHref)}" target="_blank" rel="noopener" aria-label="Abrir ubicación de ${escapeHtml(businessName)} en Google Maps"><span>Cómo llegar</span>${icons.arrow}</a>` : ''}</section>` : ''}
      </div>
      <ul class="footer-trust" aria-label="Compra con confianza">
        <li>${icons.check}<span>Atención personalizada</span></li>
        ${whatsAppHref ? `<li>${icons.check}<span>Pedidos por WhatsApp</span></li>` : ''}
      </ul>
    </div>
    <div class="footer-closing"><div class="container"><span>© ${new Date().getFullYear()} ${escapeHtml(businessName)}</span><a href="admin/login.html">Administrar</a></div></div>
  </footer>`;

  const floatMarkup = whatsAppHref ? `<a class="whatsapp-float" href="${escapeHtml(whatsAppHref)}" target="_blank" rel="noopener" aria-label="Contactar a ${escapeHtml(businessName)} por WhatsApp"><img src="${localAsset('assets/images/whatsapp-official.svg')}" alt="" aria-hidden="true"></a>` : '';
  return `${footerMarkup}${floatMarkup}`;
}

function bindFooterObserver() {
  const footer = document.querySelector('[data-site-footer]');
  const whatsAppFloat = document.querySelector('.whatsapp-float');
  if (!footer || !whatsAppFloat || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(([entry]) => {
    whatsAppFloat.classList.toggle('is-footer-hidden', entry.isIntersecting);
    if (entry.isIntersecting) whatsAppFloat.setAttribute('aria-hidden', 'true');
    else whatsAppFloat.removeAttribute('aria-hidden');
    whatsAppFloat.tabIndex = entry.isIntersecting ? -1 : 0;
  }, { threshold: .05, rootMargin: '0px 0px -10% 0px' });
  observer.observe(footer);
}

export async function renderLayout() {
  const settings = await loadSettings();
  const announcement = normalizeAnnouncementSettings(settings);
  const isHome = document.body.dataset.page === 'home';
  const header = document.querySelector('#site-header');
  if (header) header.innerHTML = `${announcement.enabled ? '<aside class="announcement" data-announcement aria-label="Anuncios de la tienda"></aside>' : ''}
    <header class="site-header">
      <div class="container header-main">
        <a class="brand" href="index.html" aria-label="Ir al inicio">${brand(settings)}</a>
        ${isHome ? homeSearchToolbar('desktop-search') : searchBox('desktop-search')}
        <div class="header-actions">
          <a class="icon-link" href="favoritos.html" aria-label="Favoritos">${icons.heart}<span class="badge favorite-badge">0</span></a>
          <a class="icon-link" href="carrito.html" aria-label="Carrito">${icons.bag}<span class="badge cart-badge">0</span></a>
        </div>
      </div>
      <div class="container mobile-search-wrap">${isHome ? homeSearchToolbar('mobile-search', true) : searchBox('mobile-search', true)}</div>
      <nav class="desktop-nav" aria-label="Navegación principal"><div class="container"><a href="catalogo.html">Todos los productos</a><a href="categorias.html">Categorías</a><a href="promociones.html">Promociones</a><a href="equipos.html">Equipos</a><a href="catalogo.html?sort=newest">Recién llegados</a></div></nav>
    </header>`;
  const announcementController = createAnnouncementController(header?.querySelector('[data-announcement]'), settings);
  window.addEventListener('pagehide', announcementController.stop, { once: true });

  const footer = document.querySelector('#site-footer');
  if (footer) {
    footer.innerHTML = renderFooter(settings);
    bindFooterObserver();
  }

  const mobile = document.querySelector('#mobile-nav');
  if (mobile) {
    const page = document.body.dataset.page;
    mobile.innerHTML = `<nav class="mobile-nav" aria-label="Navegación móvil">
      <a href="index.html" class="${page === 'home' ? 'active' : ''}">${icons.home}<span>Inicio</span></a>
      <a href="categorias.html" class="${['categories','listing'].includes(page) ? 'active' : ''}">${icons.grid}<span>Categorías</span></a>
      <a href="promociones.html" class="${page === 'promotions' ? 'active' : ''}">${icons.sale}<span>Promos</span></a>
      <a href="favoritos.html" class="${page === 'favorites' ? 'active' : ''}">${icons.heart}<span>Favoritos</span><b class="badge favorite-badge">0</b></a>
      <a href="carrito.html" class="${['cart','checkout'].includes(page) ? 'active' : ''}">${icons.bag}<span>Carrito</span><b class="badge cart-badge">0</b></a>
    </nav>`;
  }
  bindSearch();
  bindImageFallbacks();
  updateBadges();
  window.addEventListener('store:changed', updateBadges);
  window.addEventListener('storage', updateBadges);
  return settings;
}

function updateBadges() {
  document.querySelectorAll('.cart-badge').forEach(el => { const count = cartCount(); el.textContent = count; el.hidden = !count; });
  const favorites = getFavorites();
  document.querySelectorAll('.favorite-badge').forEach(el => { const count = favorites.length; el.textContent = count; el.hidden = !count; });
  document.querySelectorAll('[data-favorite]').forEach(button => {
    const active = favorites.includes(button.dataset.favorite);
    button.classList.toggle('active', active);
    button.setAttribute('aria-label', `${active ? 'Quitar de' : 'Agregar a'} favoritos`);
  });
}

function bindImageFallbacks() {
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied) return;
    image.dataset.fallbackApplied = 'true';
    if (image.matches('[data-team-crest-image]')) {
      const crest = image.closest('.team-crest');
      if (crest) {
        crest.textContent = image.dataset.teamInitials || '•';
        crest.classList.add('team-crest--fallback');
      }
      return;
    }
    image.src = localAsset('assets/images/product-white.svg');
    image.classList.add('image-fallback');
  }, true);
}
