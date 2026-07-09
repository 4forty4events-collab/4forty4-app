import { supabase } from '../supabase';

// Notifications data-access layer. Framework-agnostic, camelCase domain objects.
// Reads/mutations run under the notifications RLS (own rows only); the list uses
// the list_notifications RPC for unread-first ordering. Notifications are never
// created here — the server generators do that.

// Derive a navigable deep-link from a notification row. Typed targets win; else
// the generic route + payload.
function toLink(row) {
  if (row.venue_id) return { screen: 'ListingDetail', params: { id: row.venue_id, kind: 'venue' } };
  if (row.event_id) return { screen: 'ListingDetail', params: { id: row.event_id, kind: 'event' } };
  if (row.route) return { screen: row.route, params: row.payload ?? {} };
  return null;
}

export function normalizeNotification(row) {
  return {
    id: row.id,
    type: row.type,                 // event_reminder | nearby_alert | recommendation | organizer_update
    title: row.title,
    body: row.body ?? null,
    isRead: !!row.read_at,
    createdAt: row.created_at,
    market: row.market ?? null,
    link: toLink(row),              // { screen, params } | null
  };
}

// One page, unread-first (via the RPC). Offset paging — notification lists are
// short. Returns { items, nextOffset } (nextOffset null = end).
export async function fetchNotifications({ limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('list_notifications', { p_limit: limit, p_offset: offset });
  if (error) throw error;
  const items = (data ?? []).map(normalizeNotification);
  return { items, nextOffset: items.length < limit ? null : offset + items.length };
}

export async function unreadCount() {
  const { count, error } = await supabase
    .from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markRead(id) {
  const { error } = await supabase
    .from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
  if (error) throw error;
}

export async function markAllRead() {
  const { error } = await supabase
    .from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw error;
}

export async function deleteNotification(id) {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}

// Clear the whole history. The .not(id,is,null) filter satisfies supabase-js's
// required-filter rule; RLS scopes it to the caller's own rows.
export async function clearAll() {
  const { error } = await supabase.from('notifications').delete().not('id', 'is', null);
  if (error) throw error;
}
