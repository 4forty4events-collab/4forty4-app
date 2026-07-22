-- Feed Stage 4: story likes + lightweight 1:1 direct messages + social notifications.
--
-- Story engagement is DIRECT, not public: liking a story bumps a private counter and
-- pings the poster; replying to a story opens a 1:1 DM thread (so viewers can react
-- and coordinate a real outing) — never a public feed comment. New-message and
-- story-like notifications are created by DB triggers (clients never insert into
-- notifications), matching the existing generator pattern.
--
-- APPLY VIA THE SUPABASE SQL EDITOR. Do NOT `db push` (history desynced). Idempotent.

-- ============================================================================
-- 0) Allow the new notification types. The CHECK has been redefined by several
--    prior migrations (coordination / social-graph / radar), so we rebuild the
--    FULL UNION of every type the app uses — a subset would reject existing rows
--    ("check constraint is violated by some row"). Keep this list in sync if a
--    new notification type is ever added anywhere.
-- ============================================================================
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'event_reminder', 'nearby_alert', 'recommendation', 'organizer_update',  -- base (notifications)
    'registration_closing', 'date_approaching', 'feedback_prompt',           -- coordination_engine
    'new_follower',                                                           -- social_graph
    'radar_alert',                                                           -- radar_engine
    'message', 'story_like'                                                   -- stage 4 (this migration)
  ));

-- ============================================================================
-- 1) STORY LIKES — one row per (story, user); stories.like_count trigger-kept.
-- ============================================================================
alter table public.stories add column if not exists like_count int not null default 0;

create table if not exists public.story_likes (
  story_id   uuid not null references public.stories(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
create index if not exists story_likes_user_idx on public.story_likes (user_id);

alter table public.story_likes enable row level security;
drop policy if exists "story_likes readable" on public.story_likes;
create policy "story_likes readable" on public.story_likes for select using (auth.uid() is not null);
drop policy if exists "story_likes self insert" on public.story_likes;
create policy "story_likes self insert" on public.story_likes for insert with check (auth.uid() = user_id);
drop policy if exists "story_likes self delete" on public.story_likes;
create policy "story_likes self delete" on public.story_likes for delete using (auth.uid() = user_id);

create or replace function public.bump_story_like_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.stories set like_count = like_count + 1 where id = new.story_id;
  elsif tg_op = 'DELETE' then
    update public.stories set like_count = greatest(0, like_count - 1) where id = old.story_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_story_like_count on public.story_likes;
create trigger trg_story_like_count after insert or delete on public.story_likes
  for each row execute function public.bump_story_like_count();

-- Ping the story owner on a like (skip self-likes). Deep-links to the liker's profile.
create or replace function public.notify_story_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_liker text;
begin
  select user_id into v_owner from public.stories where id = new.story_id;
  if v_owner is null or v_owner = new.user_id then return null; end if;
  select coalesce(full_name, 'Someone') into v_liker from public.public_profiles where id = new.user_id;
  insert into public.notifications (user_id, type, title, body, route, payload)
  values (v_owner, 'story_like', v_liker || ' liked your story', null,
          'PublicProfile', jsonb_build_object('userId', new.user_id));
  return null;
end $$;
drop trigger if exists trg_notify_story_like on public.story_likes;
create trigger trg_notify_story_like after insert on public.story_likes
  for each row execute function public.notify_story_like();

-- ============================================================================
-- 2) DIRECT MESSAGES — lightweight 1:1. A "thread" = all messages between two users;
--    no separate conversations table (kept intentionally simple).
-- ============================================================================
create table if not exists public.direct_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body         text not null,
  story_id     uuid references public.stories(id) on delete set null,  -- context: replying to this story
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  constraint dm_not_self check (sender_id <> recipient_id)
);
create index if not exists dm_pair_idx on public.direct_messages (sender_id, recipient_id, created_at);
create index if not exists dm_recipient_unread_idx on public.direct_messages (recipient_id) where read_at is null;

alter table public.direct_messages enable row level security;
-- Either participant reads; only the sender inserts as themselves; the recipient marks read.
drop policy if exists "dm participant read" on public.direct_messages;
create policy "dm participant read" on public.direct_messages
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists "dm sender insert" on public.direct_messages;
create policy "dm sender insert" on public.direct_messages
  for insert with check (auth.uid() = sender_id);
drop policy if exists "dm recipient update" on public.direct_messages;
create policy "dm recipient update" on public.direct_messages
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

-- Notify the recipient of a new message; deep-links back to the thread with the sender.
create or replace function public.notify_direct_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sender text;
begin
  select coalesce(full_name, 'Someone') into v_sender from public.public_profiles where id = new.sender_id;
  insert into public.notifications (user_id, type, title, body, route, payload)
  values (new.recipient_id, 'message', v_sender || ' sent you a message', left(new.body, 120),
          'DmThread', jsonb_build_object('otherUserId', new.sender_id, 'otherName', v_sender));
  return null;
end $$;
drop trigger if exists trg_notify_direct_message on public.direct_messages;
create trigger trg_notify_direct_message after insert on public.direct_messages
  for each row execute function public.notify_direct_message();
