-- Feed F3 (Stage 2): ephemeral STORIES — a SEPARATE entity from feed posts.
--
-- The bug this fixes: the story builder used to route to the moment composer, which
-- writes a permanent `posts` row, so "stories" leaked into the Recommended feed.
-- Stories now have their own table with a 24h expiry; RLS only ever exposes rows
-- that haven't expired, and the feed fetch (posts) never touches this table.
--
-- APPLY VIA THE SUPABASE SQL EDITOR. Do NOT `db push` — the migration history is out
-- of sync with prod (see the migration-history-desync note). This script is
-- idempotent (if-not-exists / drop-policy-if-exists), so re-running it is a no-op.

create table if not exists public.stories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  media_url  text not null,                             -- single already-hosted R2 photo
  caption    text,
  market     text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists stories_active_idx on public.stories (expires_at desc, created_at desc);
create index if not exists stories_user_idx   on public.stories (user_id, created_at desc);

alter table public.stories enable row level security;

-- Any signed-in user can read stories that HAVEN'T expired; you manage only your own.
drop policy if exists "stories readable" on public.stories;
create policy "stories readable" on public.stories
  for select using (auth.uid() is not null and expires_at > now());

drop policy if exists "stories self insert" on public.stories;
create policy "stories self insert" on public.stories
  for insert with check (auth.uid() = user_id);

drop policy if exists "stories self delete" on public.stories;
create policy "stories self delete" on public.stories
  for delete using (auth.uid() = user_id);
