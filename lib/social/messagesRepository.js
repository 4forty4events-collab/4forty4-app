import { supabase } from '../supabase';

// Lightweight 1:1 direct messages. A "thread" is every message between the viewer and
// one other user — there's no conversations table (kept intentionally simple). RLS
// scopes reads to participants; the recipient marks messages read.

// Both directions between the two users, oldest -> newest (chat order).
export async function fetchThread(meId, otherId) {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`and(sender_id.eq.${meId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${meId})`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    recipientId: m.recipient_id,
    body: m.body,
    storyId: m.story_id ?? null,
    createdAt: m.created_at,
    readAt: m.read_at ?? null,
    mine: m.sender_id === meId,
  }));
}

export async function sendMessage({ senderId, recipientId, body, storyId }) {
  const { data, error } = await supabase.from('direct_messages').insert({
    sender_id: senderId,
    recipient_id: recipientId,
    body: body.trim(),
    story_id: storyId ?? null,
  }).select('id').single();
  if (error) throw error;
  return data;
}

async function profilesByIds(ids) {
  const uniq = Array.from(new Set((ids ?? []).filter(Boolean)));
  if (!uniq.length) return new Map();
  const { data, error } = await supabase.from('public_profiles').select('id, full_name, avatar_url').in('id', uniq);
  if (error) throw error;
  const m = new Map();
  (data ?? []).forEach((p) => m.set(p.id, { id: p.id, name: p.full_name ?? null, avatarUrl: p.avatar_url ?? null }));
  return m;
}

// The viewer's 1:1 conversations, most-recent first. Grouped client-side from recent
// messages (there's no conversations table). Rows arrive newest-first, so the first
// time a partner is seen is their latest message. unread = messages the viewer
// received from that partner and hasn't read.
export async function fetchConversations(meId) {
  if (!meId) return [];
  const { data, error } = await supabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id, body, created_at, read_at')
    .or(`sender_id.eq.${meId},recipient_id.eq.${meId}`)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = data ?? [];
  const byPartner = new Map();
  for (const m of rows) {
    const other = m.sender_id === meId ? m.recipient_id : m.sender_id;
    if (!byPartner.has(other)) {
      byPartner.set(other, { otherId: other, lastBody: m.body, lastAt: m.created_at, lastMine: m.sender_id === meId, unread: 0 });
    }
    if (m.recipient_id === meId && !m.read_at) byPartner.get(other).unread += 1;
  }
  const list = [...byPartner.values()];
  const profiles = await profilesByIds(list.map((c) => c.otherId));
  return list.map((c) => {
    const p = profiles.get(c.otherId);
    return { ...c, name: p?.name ?? null, avatarUrl: p?.avatarUrl ?? null };
  });
}

// Mark every unread message the viewer received from `otherId` as read.
export async function markThreadRead(meId, otherId) {
  const { error } = await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', meId).eq('sender_id', otherId).is('read_at', null);
  if (error) throw error;
}
