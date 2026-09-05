import { renderLayout } from './components/layout.js';

const page = document.body.dataset.page;

function applyBrandAssets() {
  const prefix = location.pathname.includes('/admin/') ? '../' : '';
  const iconUrl = `${prefix}img/logo-icon.png`;
  const icons = [...document.querySelectorAll('link[rel~="icon"]')];
  if (icons.length) icons.forEach(icon => { icon.href = iconUrl; icon.type = 'image/png'; icon.sizes = '256x256'; });
  else document.head.insertAdjacentHTML('beforeend', `<link rel="icon" type="image/png" sizes="256x256" href="${iconUrl}">`);
  let touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (!touchIcon) { touchIcon = document.createElement('link'); touchIcon.rel = 'apple-touch-icon'; document.head.append(touchIcon); }
  touchIcon.href = iconUrl;
}

applyBrandAssets();

async function start() {
  try {
    if (!page.startsWith('admin')) await renderLayout();
    const routes = {
      home: () => import('./pages/public.js').then(module => module.initHome()),
      catalog: () => import('./pages/public.js').then(module => module.initCatalog()),
      listing: () => document.body.dataset.listingType === 'category'
        ? import('./pages/categories.js').then(module => module.initCategoryListing())
        : import('./pages/public.js').then(module => module.initListing()),
      promotions: () => import('./pages/public.js').then(module => module.initPromotions()),
      categories: () => import('./pages/categories.js').then(module => module.initCategories()),
      teams: () => import('./pages/public.js').then(module => module.initTeams()),
      product: () => import('./pages/product.js').then(module => module.initProduct()),
      favorites: () => import('./pages/public.js').then(module => module.initFavorites()),
      cart: () => import('./pages/cart.js').then(module => module.initCart()),
      checkout: () => import('./pages/checkout.js').then(module => module.initCheckout()),
      'admin-login': () => import('./pages/auth.js').then(module => module.initLogin()),
      'admin-reset': () => import('./pages/auth.js').then(module => module.initReset()),
      admin: () => import('./pages/admin.js').then(module => module.initAdmin())
    };
    await routes[page]?.();
  } catch (error) {
    console.error(error);
    const main = document.querySelector('main');
    if (main && !page.startsWith('admin')) {
      main.innerHTML = `<div class="container page"><div class="empty-state"><span class="empty-state__icon">!</span><h1>No pudimos cargar esta página</h1><p>Revisa tu conexión e intenta nuevamente.</p><button id="retry-page" class="btn btn--primary" type="button">Intentar de nuevo</button></div></div>`;
      document.querySelector('#retry-page').addEventListener('click', () => location.reload());
    }
  }
}

start();
