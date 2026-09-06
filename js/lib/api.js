import { supabase } from './supabase.js';
import { currentPrice, normalizeText } from './helpers.js';

const PRODUCT_SELECT = `
  *,
  teams(id,name,slug,type,crest_url),
  brands(id,name,slug,logo_url),
  product_categories(category_id,categories(id,name,slug,parent_id)),
  product_colors(id,name,hex_code,sort_order),
  product_sizes(id,name,sort_order),
  product_variants(id,color_id,size_id,stock,active,updated_at),
  product_images(id,color_id,url,alt_text,is_primary,sort_order)
`;

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export async function getSettings() {
  return unwrap(await supabase.from('site_settings').select('*').eq('id', 1).single());
}

export async function getCategories({ all = false } = {}) {
  let query = supabase.from('categories').select('*').order('sort_order').order('name');
  if (!all) query = query.eq('active', true);
  return unwrap(await query);
}

export async function getTeams({ all = false } = {}) {
  let query = supabase.from('teams').select('*').order('name');
  if (!all) query = query.eq('active', true);
  return unwrap(await query);
}

export async function getPublishedProductCountsByTeam() {
  const rows = unwrap(await supabase
    .from('products')
    .select('team_id')
    .eq('status', 'published')
    .not('team_id', 'is', null));
  return rows.reduce((counts, product) => {
    counts[product.team_id] = (counts[product.team_id] || 0) + 1;
    return counts;
  }, {});
}

export async function getBrands({ all = false } = {}) {
  let query = supabase.from('brands').select('*').order('name');
  if (!all) query = query.eq('active', true);
  return unwrap(await query);
}

export async function getPaymentMethods({ all = false } = {}) {
  let query = supabase.from('payment_methods').select('*').order('sort_order').order('name');
  if (!all) query = query.eq('active', true);
  return unwrap(await query);
}

export async function getFilterOptions() {
  const [colors, sizes] = await Promise.all([
    unwrap(await supabase.from('product_colors').select('name,hex_code,sort_order').order('name')),
    unwrap(await supabase.from('product_sizes').select('name').order('sort_order'))
  ]);
  return {
    colors: [...new Set(colors.map(item => item.name))],
    colorDetails: [...colors.reduce((items, item) => {
      if (!items.has(item.name)) items.set(item.name, { name: item.name, hex_code: item.hex_code || '' });
      return items;
    }, new Map()).values()],
    sizes: [...new Set(sizes.map(item => item.name))]
  };
}

async function idsForFilter(table, column, value) {
  if (!value) return null;
  const query = supabase.from(table).select('product_id');
  const rows = unwrap(await (Array.isArray(value) ? query.in(column, value) : query.eq(column, value)));
  return [...new Set(rows.map(row => row.product_id))];
}

async function availableProductIds() {
  const rows = unwrap(await supabase.from('product_variants').select('product_id').eq('active', true).gt('stock', 0));
  return [...new Set(rows.map(row => row.product_id))];
}

function intersectSets(sets) {
  const available = sets.filter(Boolean);
  if (!available.length) return null;
  return [...available.reduce((acc, list) => new Set([...acc].filter(id => list.includes(id))), new Set(available[0]))];
}

export async function getProducts({
  page = 0, pageSize = 20, sort = 'featured', categoryId, teamId, brandId,
  color, size, minPrice, maxPrice, promotion = false, availability, featured, ids, search
} = {}) {
  let filteredIds = ids || null;
  const relationIds = intersectSets([
    categoryId ? await idsForFilter('product_categories', 'category_id', categoryId) : null,
    color ? await idsForFilter('product_colors', 'name', color) : null,
    size ? await idsForFilter('product_sizes', 'name', size) : null,
    availability === 'available' ? await availableProductIds() : null
  ]);
  if (relationIds) filteredIds = filteredIds ? filteredIds.filter(id => relationIds.includes(id)) : relationIds;
  if (filteredIds && !filteredIds.length) return { products: [], count: 0 };

  let query = supabase.from('products').select(PRODUCT_SELECT, { count: 'exact' }).eq('status', 'published');
  if (filteredIds) query = query.in('id', filteredIds);
  if (teamId) query = query.eq('team_id', teamId);
  if (brandId) query = query.eq('brand_id', brandId);
  if (featured === true) query = query.eq('featured', true);
  if (promotion) {
    const now = new Date().toISOString();
    query = query
      .not('promo_price', 'is', null)
      .or(`promo_start.is.null,promo_start.lte.${now}`)
      .or(`promo_end.is.null,promo_end.gte.${now}`);
  }
  if (availability === 'available') query = query.eq('force_sold_out', false);
  if (minPrice != null && minPrice !== '') query = query.gte('base_price', Number(minPrice));
  if (maxPrice != null && maxPrice !== '') query = query.lte('base_price', Number(maxPrice));
  if (search) query = query.ilike('name', `%${search.replace(/[%_]/g, '')}%`);
  if (sort === 'commercial') query = query.order('force_sold_out', { ascending: true }).order('featured', { ascending: false }).order('created_at', { ascending: false });
  else if (sort === 'newest') query = query.order('created_at', { ascending: false });
  else if (sort === 'price-asc') query = query.order('base_price', { ascending: true });
  else if (sort === 'price-desc') query = query.order('base_price', { ascending: false });
  else if (sort === 'name') query = query.order('name');
  else query = query.order('featured', { ascending: false }).order('created_at', { ascending: false });
  query = query.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  let products = promotion ? data.filter(product => currentPrice(product) < Number(product.base_price)) : data;
  if (sort === 'discount') products = products
    .sort((a, b) => (1 - currentPrice(b) / Number(b.base_price || 1)) - (1 - currentPrice(a) / Number(a.base_price || 1)));
  if (sort === 'relevance' && ids) products.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return { products, count };
}

export async function getProductBySlug(slug) {
  const product = unwrap(await supabase.from('products').select(PRODUCT_SELECT).eq('slug', slug).maybeSingle());
  if (!product) throw new Error('Producto no encontrado');
  return product;
}

export async function getProductsByIds(ids = []) {
  if (!ids.length) return [];
  const products = unwrap(await supabase.from('products').select(PRODUCT_SELECT).in('id', ids).eq('status', 'published'));
  return ids.map(id => products.find(product => product.id === id)).filter(Boolean);
}

export async function getEntityBySlug(type, slug) {
  const table = { category: 'categories', team: 'teams', brand: 'brands' }[type];
  if (!table) throw new Error('Tipo de listado no válido');
  const entity = unwrap(await supabase.from(table).select('*').eq('slug', slug).maybeSingle());
  if (!entity) throw new Error('Listado no encontrado');
  return entity;
}

export async function searchProducts(term, limit = 8) {
  const clean = term.trim();
  if (clean.length < 2) return [];
  const rpc = await supabase.rpc('search_products', { search_term: clean, result_limit: limit });
  if (!rpc.error) return rpc.data;
  console.warn('RPC search fallback:', rpc.error.message);
  const { products } = await getProducts({ pageSize: 50 });
  const words = normalizeText(clean).split(' ');
  return products.map(product => {
    const haystack = normalizeText([
      product.name, product.description, product.material, product.teams?.name, product.brands?.name,
      ...product.product_colors.map(c => c.name), ...product.product_categories.map(c => c.categories?.name)
    ].filter(Boolean).join(' '));
    return { ...product, image_url: product.product_images[0]?.url, team_name: product.teams?.name, brand_name: product.brands?.name, score: words.filter(word => haystack.includes(word)).length };
  }).filter(item => item.score).sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function validateCart(items) {
  const payload = items.map(item => ({ variant_id: item.variant_id, quantity: item.quantity }));
  const result = await supabase.rpc('validate_cart', { cart_items: payload });
  if (!result.error) return result.data;
  console.warn('Cart validation fallback:', result.error.message);
  const variantIds = payload.map(item => item.variant_id);
  const variants = unwrap(await supabase.from('product_variants').select('*, product_colors(name), product_sizes(name), products(*)').in('id', variantIds));
  return payload.map(item => {
    const variant = variants.find(v => v.id === item.variant_id);
    if (!variant) return { variant_id: item.variant_id, valid: false, reason: 'Esta combinación ya no está disponible.' };
    const product = variant.products;
    const valid = product.status === 'published' && variant.active && !product.force_sold_out && variant.stock >= item.quantity;
    return { variant_id: variant.id, product_id: product.id, product_name: product.name, product_slug: product.slug, product_status: product.status, color_name: variant.product_colors.name, size_name: variant.product_sizes.name, stock: variant.stock, current_price: currentPrice(product), requested_quantity: item.quantity, valid, reason: valid ? null : `Actualmente solo quedan ${variant.stock} unidades.` };
  });
}

export async function getAdminProducts() {
  return unwrap(await supabase.from('products').select(PRODUCT_SELECT).order('updated_at', { ascending: false }));
}

export async function saveRow(table, values, id = null) {
  const query = id ? supabase.from(table).update(values).eq('id', id) : supabase.from(table).insert(values);
  return unwrap(await query.select().single());
}

export async function deleteRow(table, id) {
  return unwrap(await supabase.from(table).delete().eq('id', id).select());
}

export async function getCatalogEntityDependencies(entityType, entityId) {
  return unwrap(await supabase.rpc('catalog_entity_dependencies', {
    entity_type: entityType,
    entity_id: entityId
  }));
}

export async function deleteCatalogEntitySafely(entityType, entityId) {
  return unwrap(await supabase.rpc('delete_catalog_entity_safely', {
    entity_type: entityType,
    entity_id: entityId
  }));
}

export async function removeCatalogEntityAsset(entityType, assetUrl = '') {
  const config = {
    categories: { bucket: 'category-images', folder: 'categories/' },
    teams: { bucket: 'team-crests', folder: 'teams/' },
    brands: { bucket: 'brand-assets', folder: 'brands/' }
  }[entityType];
  if (!config || !/^https?:\/\//i.test(assetUrl)) return false;
  const marker = `/storage/v1/object/public/${config.bucket}/`;
  let pathname;
  try { pathname = new URL(assetUrl).pathname; } catch { return false; }
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return false;
  const path = decodeURIComponent(pathname.slice(markerIndex + marker.length));
  if (!path.startsWith(config.folder) || path.includes('..')) return false;
  unwrap(await supabase.storage.from(config.bucket).remove([path]));
  return true;
}

export async function removePaymentMethodAsset(assetUrl = '') {
  if (!/^https?:\/\//i.test(assetUrl)) return false;
  const marker = '/storage/v1/object/public/site-assets/';
  let pathname;
  try { pathname = new URL(assetUrl).pathname; } catch { return false; }
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return false;
  const path = decodeURIComponent(pathname.slice(markerIndex + marker.length));
  if (!path.startsWith('payment-methods/') || path.includes('..')) return false;
  unwrap(await supabase.storage.from('site-assets').remove([path]));
  return true;
}

export async function saveSettings(values) {
  return unwrap(await supabase.from('site_settings').update(values).eq('id', 1).select().single());
}

export async function replaceProductRelations(productId, { categoryIds, colors, sizes, variants }) {
  if (categoryIds) {
    unwrap(await supabase.from('product_categories').delete().eq('product_id', productId));
    if (categoryIds.length) unwrap(await supabase.from('product_categories').insert(categoryIds.map(category_id => ({ product_id: productId, category_id }))));
  }
  if (colors && sizes && variants) {
    const existingColors = unwrap(await supabase.from('product_colors').select('id').eq('product_id', productId));
    const existingSizes = unwrap(await supabase.from('product_sizes').select('id').eq('product_id', productId));
    const keptColorIds = colors.map(item => item.id).filter(Boolean);
    const keptSizeIds = sizes.map(item => item.id).filter(Boolean);
    for (const item of existingColors.filter(row => !keptColorIds.includes(row.id))) unwrap(await supabase.from('product_colors').delete().eq('id', item.id));
    for (const item of existingSizes.filter(row => !keptSizeIds.includes(row.id))) unwrap(await supabase.from('product_sizes').delete().eq('id', item.id));
    const savedColors = [];
    for (const [index, item] of colors.entries()) savedColors.push(unwrap(await (item.id
      ? supabase.from('product_colors').update({ name: item.name, hex_code: item.hex_code || null, sort_order: index }).eq('id', item.id)
      : supabase.from('product_colors').insert({ product_id: productId, name: item.name, hex_code: item.hex_code || null, sort_order: index })).select().single()));
    const savedSizes = [];
    for (const [index, item] of sizes.entries()) savedSizes.push(unwrap(await (item.id
      ? supabase.from('product_sizes').update({ name: item.name, sort_order: index }).eq('id', item.id)
      : supabase.from('product_sizes').insert({ product_id: productId, name: item.name, sort_order: index })).select().single()));
    unwrap(await supabase.from('product_variants').delete().eq('product_id', productId));
    const rows = [];
    for (const color of savedColors) for (const size of savedSizes) {
      const original = variants.find(v => v.colorName === color.name && v.sizeName === size.name);
      rows.push({ product_id: productId, color_id: color.id, size_id: size.id, stock: Math.max(0, Number(original?.stock || 0)), active: original?.active !== false });
    }
    if (rows.length) unwrap(await supabase.from('product_variants').insert(rows));
    return { savedColors, savedSizes };
  }
  return { savedColors: [], savedSizes: [] };
}

export async function uploadImage(bucket, file, folder = 'uploads') {
  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  unwrap(await supabase.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false }));
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function saveProductImages(productId, files, colorId = null) {
  const rows = [];
  for (const [index, file] of files.entries()) {
    const url = await uploadImage('product-images', file, productId);
    rows.push({ product_id: productId, color_id: colorId, url, alt_text: file.name, is_primary: index === 0, sort_order: index });
  }
  if (rows.length) return unwrap(await supabase.from('product_images').insert(rows).select());
  return [];
}

export { supabase };
