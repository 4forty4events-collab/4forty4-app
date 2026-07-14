-- Module 4: Social graph — follows, an activity feed, and shareable collections.
-- Builds on public_profiles (name/avatar/trust), the queue_notification mechanism,
-- and the collections tables from module 2.

-- ============================================================================
-- 1) FOLLOWS — a directed edge (follower -> following). Public graph.
-- ============================================================================
create table if not exists public.follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;
-- Anyone signed in can READ the graph (counts, who-follows-whom); you only WRITE
-- your own edges.
drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows for select using (auth.uid() is not null);
drop policy if exists "follow self insert" on public.follows;
create policy "follow self insert" on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists "unfollow self delete" on public.follows;
create policy "unfollow self delete" on public.follows for delete using (auth.uid() = follower_id);

-- ============================================================================
-- 2) ACTIVITY — a stream of shareable public actions. Written ONLY by triggers
--    (below), never directly by clients, so we control what becomes public.
-- ============================================================================
create table if not exists public.activity (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid not null references auth.users(id) on delete cascade,
  verb          text not null check (verb in ('reviewed', 'shared_collection', 'followed')),
  venue_id      uuid references public.venues(id) on delete cascade,
  event_id      uuid references public.events(id) on delete cascade,
  collection_id uuid references public.collections(id) on delete cascade,
  subject_id    uuid references auth.users(id) on delete cascade,  -- 'followed' target
  market        text,
  created_at    timestamptz not null default now()
);
create index if not exists activity_actor_idx on public.activity (actor_id, created_at desc);

alter table public.activity enable row level security;
-- Direct reads are own-rows only; the followed-users feed comes from the
-- security-definer RPC below (so no one can scrape the whole stream). No client
-- INSERT policy — the triggers (SECURITY DEFINER) are the only writers.
drop policy if exists "own activity select" on public.activity;
create policy "own activity select" on public.activity for select using (auth.uid() = actor_id);

-- Feed: activity from the people the caller follows, keyset-paginated by created_at.
create or replace function public.get_activity_feed(p_limit int default 20, p_before timestamptz default null)
returns table (
  id uuid, actor_id uuid, actor_name text, actor_avatar text, verb text,
  venue_id uuid, event_id uuid, collection_id uuid, subject_id uuid, subject_name text,
  target_title text, target_image text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.id, a.actor_id, ap.full_name, ap.avatar_url, a.verb,
         a.venue_id, a.event_id, a.collection_id, a.subject_id, sp.full_name,
         coalesce(v.name, e.title, c.name)                as target_title,
         coalesce(v.cover_image_url, e.cover_image_url)   as target_image,
         a.created_at
  from public.activity a
  join public.follows f on f.following_id = a.actor_id and f.follower_id = auth.uid()
  left join public.public_profiles ap on ap.id = a.actor_id
  left join public.public_profiles sp on sp.id = a.subject_id
  left join public.venues v       on v.id = a.venue_id
  left join public.events e       on e.id = a.event_id
  left join public.collections c  on c.id = a.collection_id
  where (p_before is null or a.created_at < p_before)
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
grant execute on function public.get_activity_feed(int, timestamptz) to authenticated;

-- Follower / following counts + whether the caller follows the user, in one call.
create or replace function public.get_follow_stats(p_user uuid)
returns table (followers int, following int, is_following boolean)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.follows where following_id = p_user)::int,
    (select count(*) from public.follows where follower_id = p_user)::int,
    exists (select 1 from public.follows where follower_id = auth.uid() and following_id = p_user);
$$;
grant execute on function public.get_follow_stats(uuid) to authenticated;

-- ============================================================================
-- 3) ACTIVITY WRITERS + follower notification
-- ============================================================================
create or replace function public.activity_on_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' then
    insert into public.activity (actor_id, verb, venue_id, event_id, market)
    values (new.user_id, 'reviewed', new.venue_id, new.event_id, new.market);
  end if;
  return new;
end $$;
drop trigger if exists trg_activity_on_review on public.reviews;
create trigger trg_activity_on_review after insert on public.reviews
  for each row execute function public.activity_on_review();

-- Extend the notification type set for the new 'new_follower' kind (default-on:
-- queue_notification's `else true` branch means no preference toggle needed).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('event_reminder', 'nearby_alert', 'recommendation', 'organizer_update',
                  'registration_closing', 'date_approaching', 'feedback_prompt', 'new_follower'));

create or replace function public.on_new_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity (actor_id, verb, subject_id)
  values (new.follower_id, 'followed', new.following_id);
  perform public.queue_notification(
    new.following_id, 'new_follower', 'New follower',
    coalesce((select full_name from public.profiles where id = new.follower_id), 'Someone') || ' started following you',
    null, null, 'Activity', jsonb_build_object('follower_id', new.follower_id), null
  );
  return new;
end $$;
drop trigger if exists trg_on_new_follow on public.follows;
create trigger trg_on_new_follow after insert on public.follows
  for each row execute function public.on_new_follow();

-- ============================================================================
-- 4) SHAREABLE COLLECTIONS — make a collection public + a share slug.
-- ============================================================================
alter table public.collections
  add column if not exists is_public boolean not null default false,
  add column if not exists share_slug text unique;

-- Anyone may READ a public collection and its items (in addition to the owner's
-- existing full access). Both are OR'd with the "own" policies (permissive).
drop policy if exists "public collections readable" on public.collections;
create policy "public collections readable" on public.collections for select using (is_public = true);
drop policy if exists "public collection items readable" on public.collection_items;
create policy "public collection items readable" on public.collection_items for select using (
  exists (select 1 from public.collections c where c.id = collection_id and c.is_public = true)
);

create or replace function public.activity_on_share_collection() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_public and not coalesce(old.is_public, false) then
    insert into public.activity (actor_id, verb, collection_id)
    values (new.user_id, 'shared_collection', new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_activity_on_share_collection on public.collections;
create trigger trg_activity_on_share_collection after update on public.collections
  for each row execute function public.activity_on_share_collection();
