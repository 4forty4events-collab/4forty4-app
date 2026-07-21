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

// Mark every unread message the viewer received from `otherId` as read.
export async function markThreadRead(meId, otherId) {
  const { error } = await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', meId).eq('sender_id', otherId).is('read_at', null);
  if (error) throw error;
}
