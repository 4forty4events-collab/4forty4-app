-- Module 5: notification DELIVERY — device push tokens + a delivery marker.
-- The generators already exist (queue_notification / enqueue_event_reminders /
-- notify_new_venue). This adds the last mile: a place to store device push tokens
-- and a flag the deliver-push edge function sweeps to send each new notification.

-- Expo push tokens, one row per device token (a user may have several devices).
create table if not exists public.push_tokens (
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text primary key,
  platform   text,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
drop policy if exists "own push tokens" on public.push_tokens;
create policy "own push tokens" on public.push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Delivery marker: null = queued but not yet pushed to devices. The deliver-push
-- function selects these (service role), sends via Expo, and stamps pushed_at.
alter table public.notifications add column if not exists pushed_at timestamptz;
create index if not exists notifications_undelivered_idx
  on public.notifications (created_at) where pushed_at is null;
