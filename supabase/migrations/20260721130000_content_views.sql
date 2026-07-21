-- Feed Stage 3: real watch/scroll DWELL tracking + engagement rollups for ranking.
--
-- content_views records one row per meaningful view event (a post that was on screen
-- past a threshold), carrying how long it was in the viewport (dwell_ms) and whether
-- the viewer "really looked" (completed). A trigger rolls each view up onto the post
-- (view_count / dwell_ms_total) so the feed ranker never has to scan this table.
--
-- APPLY VIA THE SUPABASE SQL EDITOR. Do NOT `db push` (migration history desynced).
-- Idempotent: safe to re-run.

-- 1) Fast rollups on the post, maintained by the trigger below.
alter table public.posts add column if not exists view_count     int    not null default 0;
alter table public.posts add column if not exists dwell_ms_total  bigint not null default 0;

-- 2) Raw view events. dwell_ms = time in viewport; completed = crossed the "really
--    looked" bar (client threshold). One row per view event; a user may view twice.
create table if not exists public.content_views (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  dwell_ms   int  not null default 0,
  completed  boolean not null default false,
  market     text,
  created_at timestamptz not null default now()
);
create index if not exists content_views_post_idx on public.content_views (post_id);
create index if not exists content_views_user_idx on public.content_views (user_id, created_at desc);

alter table public.content_views enable row level security;
-- You may only write/read your OWN view events (raw dwell is private analytics; the
-- aggregate lives on posts via the trigger, which runs as definer).
drop policy if exists "content_views self insert" on public.content_views;
create policy "content_views self insert" on public.content_views
  for insert with check (auth.uid() = user_id);
drop policy if exists "content_views self read" on public.content_views;
create policy "content_views self read" on public.content_views
  for select using (auth.uid() = user_id);

-- 3) Roll each view up onto its post so ranking reads posts directly.
create or replace function public.bump_post_view_rollup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.posts
     set view_count     = view_count + 1,
         dwell_ms_total = dwell_ms_total + greatest(coalesce(new.dwell_ms, 0), 0)
   where id = new.post_id;
  return null;
end $$;
drop trigger if exists trg_post_view_rollup on public.content_views;
create trigger trg_post_view_rollup after insert on public.content_views
  for each row execute function public.bump_post_view_rollup();
