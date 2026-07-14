import { supabase } from '../supabase';
import { THEMES } from '../../components/merch/catalog';

// Data layer for the TOZVINZWISISA merch catalog. Reads are public (RLS select-all);
// every write routes through the admin-gated SECURITY DEFINER RPCs. Rows are shaped into
// the SAME product object the static catalog uses, so LookbookCard renders either source
// unchanged (theme KEY -> tint/glow resolved here).

function shapeProduct(row) {
  const theme = THEMES[row.theme] ?? THEMES.ember;
  const images = Array.isArray(row.images) ? row.images.filter(Boolean) : [];
  const sizes = Array.isArray(row.sizes)
    ? row.sizes.filter((s) => s && s.size).map((s) => ({ size: String(s.size), soldOut: !!s.soldOut }))
    : [];
  return {
    id: row.id,
    name: row.name ?? '',
    category: row.category ?? '',
    kind: row.kind ?? 'CAPSULE',
    fabric: row.fabric ?? '',
    price: { DZD: row.price_dzd ?? 0, USD: row.price_usd ?? 0 },
    images,
    image: images[0] ?? null, // cover, for the fallback-compatible single-image path
    theme: row.theme ?? 'ember',
    tint: theme.tint,
    glow: theme.glow,
    featured: !!row.featured,
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
    sizes,
    soldOut: sizes.length > 0 && sizes.every((s) => s.soldOut),
    promoted: !!row.promoted,
  };
}

// Storefront read: only ACTIVE products, featured first then by sort order. Returns [] on
// any failure (table missing before migration, offline) so the screen falls back cleanly.
export async function fetchMerchProducts() {
  const { data, error } = await supabase
    .from('merch_products')
    .select('*')
    .eq('active', true)
    .order('featured', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []).map(shapeProduct);
}

// Promoted products for the Discover ad slot: active + promoted, featured first.
export async function fetchPromotedMerch() {
  const { data, error } = await supabase
    .from('merch_products')
    .select('*')
    .eq('active', true)
    .eq('promoted', true)
    .order('featured', { ascending: false })
    .order('sort_order', { ascending: true });
  if (error) return [];
  return (data ?? []).map(shapeProduct);
}

// Admin list: every product incl. inactive, in edit order.
export async function fetchAllMerchProducts() {
  const { data, error } = await supabase
    .from('merch_products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(shapeProduct);
}

// Create (id null) or update (id set). Returns the row id.
export async function upsertMerchProduct(input) {
  const { data, error } = await supabase.rpc('upsert_merch_product', {
    p_id: input.id ?? null,
    p_name: input.name,
    p_category: input.category ?? null,
    p_kind: input.kind ?? null,
    p_fabric: input.fabric ?? null,
    p_price_dzd: input.priceDzd ?? 0,
    p_price_usd: input.priceUsd ?? 0,
    p_images: Array.isArray(input.images) ? input.images.filter(Boolean) : [],
    p_theme: input.theme ?? 'ember',
    p_featured: !!input.featured,
    p_active: input.active !== false,
    p_sort_order: input.sortOrder ?? 0,
    p_sizes: Array.isArray(input.sizes) ? input.sizes : [],
    p_promoted: !!input.promoted,
  });
  if (error) {
    const m = error.message || '';
    if (m.includes('NOT_ADMIN')) throw new Error('NOT_ADMIN');
    if (m.includes('NAME_REQUIRED')) throw new Error('NAME_REQUIRED');
    if (m.includes('BAD_THEME')) throw new Error('BAD_THEME');
    if (m.includes('NOT_FOUND')) throw new Error('NOT_FOUND');
    throw error;
  }
  return data; // product id
}

export async function deleteMerchProduct(id) {
  const { error } = await supabase.rpc('delete_merch_product', { p_id: id });
  if (error) throw error;
}

// ── Payment destinations (admin-editable). Read returns { CCP?: {lines, note},
// EcoCash?: {lines, note} }; the caller merges with the catalog.js defaults. Returns {}
// on failure (table missing before migration) so checkout falls back cleanly.
export async function fetchMerchPayment() {
  const { data, error } = await supabase.from('merch_payment').select('*');
  if (error) return {};
  const out = {};
  (data ?? []).forEach((r) => { out[r.method] = { lines: r.lines ?? [], note: r.note ?? null }; });
  return out;
}

// lines = [[label, value], …]. Admin-gated server-side.
export async function upsertMerchPayment(method, lines, note) {
  const { error } = await supabase.rpc('upsert_merch_payment', {
    p_method: method, p_lines: lines ?? [], p_note: note ?? null,
  });
  if (error) {
    const m = error.message || '';
    if (m.includes('NOT_ADMIN')) throw new Error('NOT_ADMIN');
    if (m.includes('BAD_METHOD')) throw new Error('BAD_METHOD');
    throw error;
  }
}

// ── Customer orders ────────────────────────────────────────────────────────────────────
function shapeOrder(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind ?? 'product',
    itemName: row.item_name ?? '',
    size: row.size ?? null,
    amountLabel: row.amount_label ?? '',
    market: row.market ?? null,
    payMethod: row.pay_method ?? null,
    name: row.customer_name ?? '',
    phone: row.customer_phone ?? '',
    address: row.customer_address ?? null,
    imageUrl: row.image_url ?? null,
    status: row.status ?? 'new',
    note: row.note ?? null,
  };
}

// Place an order (checkout). Works for guests via the definer RPC. Returns the order id.
export async function placeMerchOrder(o) {
  const { data, error } = await supabase.rpc('place_merch_order', {
    p_kind: o.kind ?? 'product',
    p_item_name: o.itemName ?? 'Order',
    p_size: o.size ?? null,
    p_amount_label: o.amountLabel ?? null,
    p_market: o.market ?? null,
    p_pay_method: o.payMethod ?? null,
    p_name: o.name,
    p_phone: o.phone,
    p_address: o.address ?? null,
    p_image_url: o.imageUrl ?? null,
  });
  if (error) {
    const m = error.message || '';
    if (m.includes('NAME_REQUIRED')) throw new Error('NAME_REQUIRED');
    if (m.includes('PHONE_REQUIRED')) throw new Error('PHONE_REQUIRED');
    throw error;
  }
  return data;
}

// Admin: all orders (optionally filtered by status), newest first. RLS restricts to admins.
export async function fetchMerchOrders(status) {
  let q = supabase.from('merch_orders').select('*').order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(shapeOrder);
}

export async function setMerchOrderStatus(id, status) {
  const { error } = await supabase
    .from('merch_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Patch editable fields (name/phone/address/note/status). Only provided keys change.
export async function updateMerchOrder(id, fields) {
  const patch = { updated_at: new Date().toISOString() };
  if (fields.name != null) patch.customer_name = fields.name;
  if (fields.phone != null) patch.customer_phone = fields.phone;
  if (fields.address !== undefined) patch.customer_address = fields.address || null;
  if (fields.note !== undefined) patch.note = fields.note || null;
  if (fields.status != null) patch.status = fields.status;
  const { error } = await supabase.from('merch_orders').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteMerchOrder(id) {
  const { error } = await supabase.from('merch_orders').delete().eq('id', id);
  if (error) throw error;
}
