const CART_KEY = 'fueradelugar_cart_v1';
const FAVORITES_KEY = 'fueradelugar_favorites_v1';

function read(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('store:changed', { detail: { key, value } }));
}

export const getCart = () => read(CART_KEY, []).filter(item => item && typeof item === 'object' && typeof item.variant_id === 'string' && Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0);
export const setCart = cart => write(CART_KEY, cart);
export const clearCart = () => setCart([]);
export const getFavorites = () => read(FAVORITES_KEY, []).filter(id => typeof id === 'string');
export const setFavorites = favorites => write(FAVORITES_KEY, favorites);
export const isFavorite = id => getFavorites().includes(id);

export function toggleFavorite(id) {
  const favorites = getFavorites();
  const next = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id];
  setFavorites(next);
  return next.includes(id);
}

export function addCartItem(item) {
  const cart = getCart();
  const identity = candidate => `${candidate.variant_id}:${JSON.stringify(candidate.personalization || {})}`;
  const existing = cart.find(candidate => identity(candidate) === identity(item));
  if (existing) existing.quantity = Math.min(Number(existing.stock || 99), existing.quantity + item.quantity);
  else cart.push({ ...item, line_id: crypto.randomUUID() });
  setCart(cart);
}

export function updateCartLine(lineId, patch) {
  setCart(getCart().map(item => item.line_id === lineId ? { ...item, ...patch } : item));
}

export function removeCartLine(lineId) { setCart(getCart().filter(item => item.line_id !== lineId)); }
export const cartCount = () => getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
export const cartTotal = () => getCart().reduce((sum, item) => sum + (Number(item.price || 0) + Number(item.personalization_price || 0)) * Number(item.quantity || 0), 0);
