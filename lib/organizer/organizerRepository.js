import { supabase } from '../supabase';
import { normalizeVenue, normalizeEvent } from '../feed';

// Organizer & Creator Ecosystem data-access layer. Framework-agnostic. Ownership
// is enforced by RLS / SECURITY DEFINER RPCs (this layer is UX, not the security
// boundary). Organizer profiles, listing management, and owner-gated analytics.

// ---- normalizers -----------------------------------------------------------
export function normalizeOrganizer(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description ?? null,
    logoUrl: row.logo_url ?? null,
    coverUrl: row.cover_url ?? null,
    contactEmail: row.contact_email ?? null,
    contactPhone: row.contact_phone ?? null,
    contactWhatsapp: row.contact_whatsapp ?? null,
    website: row.website ?? null,
    instagram: row.instagram ?? null,
    verificationStatus: row.verification_status,
    isVerified: row.verification_status === 'verified',
    verifiedAt: row.verified_at ?? null,
    market: row.market ?? null,
    createdAt: row.created_at,
  };
}

const ORG_FIELDS = {
  name: 'name', description: 'description', logoUrl: 'logo_url', coverUrl: 'cover_url',
  contactEmail: 'contact_email', contactPhone: 'contact_phone', contactWhatsapp: 'contact_whatsapp',
  website: 'website', instagram: 'instagram', market: 'market',
};

function pick(patch, map) {
  const row = {};
  for (const [key, col] of Object.entries(map)) if (key in patch) row[col] = patch[key];
  return row;
}

// ---- organizer profiles ----------------------------------------------------
export async function getMyOrganizers(userId) {
  const { data, error } = await supabase.from('organizers').select('*').eq('owner_id', userId).order('created_at');
  if (error) throw error;
  return (data ?? []).map(normalizeOrganizer);
}

export async function getOrganizer(id) {
  const { data, error } = await supabase.from('organizers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return normalizeOrganizer(data);
}

export async function createOrganizer(userId, { name, market, ...rest }) {
  const { data, error } = await supabase.from('organizers')
    .insert({ owner_id: userId, name, market: market ?? null, ...pick(rest, ORG_FIELDS) })
    .select('*').single();
  if (error) throw error;
  return normalizeOrganizer(data);
}

// Branding/contact only — verification fields are protected by a DB trigger.
export async function updateOrganizer(id, patch) {
  const { data, error } = await supabase.from('organizers')
    .update({ ...pick(patch, ORG_FIELDS), updated_at: new Date().toISOString() })
    .eq('id', id).select('*').single();
  if (error) throw error;
  return normalizeOrganizer(data);
}

// Admin-only (RPC self-gates via is_admin()).
export async function verifyOrganizer(id, status) {
  const { error } = await supabase.rpc('verify_organizer', { p_id: id, p_status: status });
  if (error) throw error;
}

// ---- listing management ----------------------------------------------------
export async function claimVenue(organizerId, venueId) {
  const { error } = await supabase.rpc('claim_venue', { p_venue: venueId, p_organizer: organizerId });
  if (error) throw error;
}

export async function listMyVenues(organizerId) {
  const { data, error } = await supabase.from('venues').select('*').eq('organizer_id', organizerId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeVenue);
}

export async function listMyEvents(organizerId) {
  const { data, error } = await supabase.from('events').select('*, venues(name)').eq('organizer_id', organizerId).order('start_time', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeEvent);
}

const VENUE_FIELDS = {
  name: 'name', description: 'description', category: 'category', tags: 'tags', address: 'address',
  coverImageUrl: 'cover_image_url', imageUrls: 'image_urls',
  contactWhatsapp: 'contact_whatsapp', contactPhone: 'contact_phone', contactInstagram: 'contact_instagram',
  pricePerPerson: 'price_per_person', priceType: 'price_type', priceMax: 'price_max',
  menuText: 'menu_text', menuUrl: 'menu_url',
};

// Owner edits their own venue (RLS scopes to venues whose organizer the caller
// owns). Only whitelisted display fields — never organizer_id/market/is_stub.
export async function updateMyVenue(venueId, patch) {
  const { data, error } = await supabase.from('venues').update(pick(patch, VENUE_FIELDS)).eq('id', venueId).select('*').single();
  if (error) throw error;
  return normalizeVenue(data);
}

// Post a new event under an organizer's venue. start_time is a full ISO string
// (the UI computes it from a date/time picker); RLS with-check enforces ownership.
export async function createEvent(userId, organizerId, {
  venueId, title, description, category, tags, startTime, price, currency, market, coverImageUrl,
}) {
  const { data, error } = await supabase.from('events').insert({
    organizer_id: organizerId,
    venue_id: venueId ?? null,
    created_by: userId,
    title,
    description: description ?? null,
    category: category ?? 'other',
    tags: tags ?? [],
    start_time: startTime ?? null,
    price: price ?? null,
    currency: currency ?? null,
    market,
    cover_image_url: coverImageUrl ?? null,
  }).select('*, venues(name)').single();
  if (error) throw error;
  return normalizeEvent(data);
}

const EVENT_FIELDS = {
  title: 'title', description: 'description', category: 'category', tags: 'tags',
  startTime: 'start_time', price: 'price', currency: 'currency', coverImageUrl: 'cover_image_url',
};

export async function updateEvent(eventId, patch) {
  const { data, error } = await supabase.from('events').update(pick(patch, EVENT_FIELDS)).eq('id', eventId).select('*, venues(name)').single();
  if (error) throw error;
  return normalizeEvent(data);
}

export async function deleteEvent(eventId) {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

// ---- analytics (owner/admin-gated aggregation) -----------------------------
export async function getListingAnalytics(kind, id, days = 30) {
  const { data, error } = await supabase.rpc('get_listing_analytics', { p_kind: kind, p_id: id, p_days: days });
  if (error) throw error;
  const a = data ?? {};
  const tot = a.totals ?? {};
  return {
    totals: { views: tot.views ?? 0, saves: tot.saves ?? 0, checkIns: tot.check_ins ?? 0 },
    daily: (a.daily ?? []).map((d) => ({ date: d.date, views: d.views ?? 0, saves: d.saves ?? 0, checkIns: d.check_ins ?? 0 })),
  };
}
