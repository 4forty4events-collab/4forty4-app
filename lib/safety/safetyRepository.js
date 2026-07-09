import { supabase } from '../supabase';

// Safety, Security & Trust data-access layer. Framework-agnostic. Reporting +
// trust tiers (admin-gated via RPCs) + the read-heavy safety registry. A report
// "target" is { type: 'venue'|'event'|'organizer', id }.

const REASONS = ['scam', 'abuse', 'incorrect_details', 'safety', 'spam', 'other'];
const REPORT_STATUSES = ['pending', 'reviewing', 'actioned', 'dismissed'];
const TRUST_TIERS = ['standard', 'verified_citizen', 'community_guide'];
export { REASONS, REPORT_STATUSES, TRUST_TIERS };

// ---- normalizers -----------------------------------------------------------
export function normalizeReport(row) {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    targetId: row.venue_id ?? row.event_id ?? row.organizer_id,
    reason: row.reason,
    details: row.details ?? null,
    status: row.status,
    resolutionNote: row.resolution_note ?? null,
    handledAt: row.handled_at ?? null,
    market: row.market ?? null,
    createdAt: row.created_at,
  };
}

export function normalizeSafetyContact(row) {
  return {
    id: row.id,
    market: row.market,
    region: row.region ?? null,
    category: row.category,
    name: row.name,
    phone: row.phone,
    description: row.description ?? null,
    sortOrder: row.sort_order ?? 0,
  };
}

// ---- reporting -------------------------------------------------------------
export async function createReport(userId, target, { reason, details, market }) {
  if (!REASONS.includes(reason)) throw new Error('Invalid reason.');
  const cols = { venue_id: null, event_id: null, organizer_id: null };
  cols[`${target.type}_id`] = target.id;
  const { data, error } = await supabase.from('reports').insert({
    reporter_id: userId,
    target_type: target.type,
    ...cols,
    reason,
    details: details?.trim() || null,
    market: market ?? null,
  }).select('*').single();
  if (error) throw error;
  return normalizeReport(data);
}

// The caller's own reports (RLS scopes non-admins to their own rows).
export async function getMyReports(userId) {
  const { data, error } = await supabase.from('reports')
    .select('*').eq('reporter_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeReport);
}

// Admin moderation queue (RLS grants admins all rows; a non-admin gets only own).
export async function listReports({ status = null } = {}) {
  let q = supabase.from('reports').select('*').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(normalizeReport);
}

// Admin status workflow (self-gates via is_admin() in the RPC).
export async function resolveReport(id, status, note = null) {
  if (!REPORT_STATUSES.includes(status)) throw new Error('Invalid status.');
  const { error } = await supabase.rpc('resolve_report', { p_id: id, p_status: status, p_note: note });
  if (error) throw error;
}

// ---- trust tiers -----------------------------------------------------------
// Admin-only (RPC self-gates); a DB trigger also blocks any non-admin change.
export async function setTrustTier(userId, tier) {
  if (!TRUST_TIERS.includes(tier)) throw new Error('Invalid tier.');
  const { error } = await supabase.rpc('set_trust_tier', { p_user: userId, p_tier: tier });
  if (error) throw error;
}

// Public trust display (id/name/avatar/tier only — private fields never exposed).
export async function getPublicProfile(userId) {
  const { data, error } = await supabase.from('public_profiles')
    .select('id, full_name, avatar_url, trust_tier').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.full_name ?? null, avatarUrl: data.avatar_url ?? null, trustTier: data.trust_tier ?? 'standard' };
}

// ---- safety registry -------------------------------------------------------
// Read-heavy, public (works for guests). Returns everything for a market ordered
// for display — ready to cache offline as one blob per market.
export async function getSafetyContacts(market, { region } = {}) {
  let q = supabase.from('safety_contacts').select('*').eq('market', market).eq('is_active', true);
  if (region) q = q.or(`region.eq.${region},region.is.null`);
  const { data, error } = await q.order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(normalizeSafetyContact);
}
