-- Community Hub — data layer. Reviews + ratings (with photo/video hooks),
-- engagement (helpful reactions, Q&A), and credibility (verified-visitor +
-- badges + derived creator stats). Same two-nullable-FK "target" shape as the
-- rest of the app (venue_id XOR event_id). Denormalized counters (helpful_count,
-- community_rating) are maintained by triggers for cheap reads at scale.

-- ============================================================================
-- 1) REVIEWS
-- ============================================================================
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text,
  photo_urls text[] not null default '{}',     -- R2 URLs (upload hook)
  video_urls text[] not null default '{}',     -- R2 URLs (upload hook)
  visited_at date,
  is_verified_visitor boolean not null default false,
  helpful_count integer not null default 0,    -- denormalized from review_reactions
  status text not null default 'published' check (status in ('published', 'hidden', 'flagged')),
  market text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_one_target check (num_nonnulls(venue_id, event_id) = 1)
);
create unique index if not exists reviews_user_venue_uniq on public.reviews (user_id, venue_id) where venue_id is not null;
create unique index if not exists reviews_user_event_uniq on public.reviews (user_id, event_id) where event_id is not null;
create index if not exists idx_reviews_venue on public.reviews (venue_id, status, created_at desc);
create index if not exists idx_reviews_event on public.reviews (event_id, status, created_at desc);
create index if not exists idx_reviews_user  on public.reviews (user_id, created_at desc);

alter table public.reviews enable row level security;
drop policy if exists "reviews read" on public.reviews;
drop policy if exists "reviews insert own" on public.reviews;
drop policy if exists "reviews update own" on public.reviews;
drop policy if exists "reviews delete own" on public.reviews;
create policy "reviews read"       on public.reviews for select using (status = 'published' or auth.uid() = user_id);
create policy "reviews insert own" on public.reviews for insert with check (auth.uid() = user_id);
create policy "reviews update own" on public.reviews for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reviews delete own" on public.reviews for delete using (auth.uid() = user_id);

-- Verified visitor: on create, a review is "verified" if the author has prior
-- engagement (an interaction or a save) with that venue.
create or replace function public.set_review_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.venue_id is not null then
    new.is_verified_visitor :=
      exists (select 1 from public.interactions i where i.user_id = new.user_id and i.venue_id = new.venue_id)
      or exists (select 1 from public.saved_items s where s.user_id = new.user_id and s.venue_id = new.venue_id);
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_review_verified on public.reviews;
create trigger trg_review_verified before insert or update on public.reviews
  for each row execute function public.set_review_verified();

-- ============================================================================
-- 2) ENGAGEMENT — helpful reactions, questions, answers
-- ============================================================================
create table if not exists public.review_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  type text not null default 'helpful' check (type in ('helpful')),
  created_at timestamptz not null default now(),
  unique (user_id, review_id, type)
);
create index if not exists idx_reactions_review on public.review_reactions (review_id);
alter table public.review_reactions enable row level security;
drop policy if exists "reactions read" on public.review_reactions;
drop policy if exists "reactions write own" on public.review_reactions;
create policy "reactions read" on public.review_reactions for select using (true);
create policy "reactions write own" on public.review_reactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Maintain reviews.helpful_count.
create or replace function public.sync_helpful_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.reviews set helpful_count = helpful_count + 1 where id = new.review_id;
  elsif tg_op = 'DELETE' then
    update public.reviews set helpful_count = greatest(helpful_count - 1, 0) where id = old.review_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_helpful_count on public.review_reactions;
create trigger trg_helpful_count after insert or delete on public.review_reactions
  for each row execute function public.sync_helpful_count();

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  body text not null,
  status text not null default 'published' check (status in ('published', 'hidden')),
  market text,
  created_at timestamptz not null default now(),
  constraint questions_one_target check (num_nonnulls(venue_id, event_id) = 1)
);
create index if not exists idx_questions_venue on public.questions (venue_id, created_at desc);
create index if not exists idx_questions_event on public.questions (event_id, created_at desc);
alter table public.questions enable row level security;
drop policy if exists "questions read" on public.questions;
drop policy if exists "questions write own" on public.questions;
create policy "questions read" on public.questions for select using (status = 'published' or auth.uid() = user_id);
create policy "questions write own" on public.questions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  is_official boolean not null default false,  -- organizer / verified-business answer
  created_at timestamptz not null default now()
);
create index if not exists idx_answers_question on public.answers (question_id, created_at);
alter table public.answers enable row level security;
drop policy if exists "answers read" on public.answers;
drop policy if exists "answers write own" on public.answers;
create policy "answers read" on public.answers for select using (true);
create policy "answers write own" on public.answers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 3) CREDIBILITY — badges (public trust signal) + derived creator stats
-- ============================================================================
create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge text not null check (badge in ('verified_visitor', 'verified_creator', 'top_reviewer', 'local_expert', 'organizer')),
  awarded_at timestamptz not null default now(),
  awarded_by uuid,   -- null = system, else the admin who granted it
  unique (user_id, badge)
);
create index if not exists idx_user_badges_user on public.user_badges (user_id);
alter table public.user_badges enable row level security;
drop policy if exists "badges read" on public.user_badges;
create policy "badges read" on public.user_badges for select using (true);
-- No client write policy: badges are awarded server-side (system/admin RPC) only.

-- Creator stats — DERIVED (like travel stats), viewable for ANY user (public
-- trust display), so it takes a user id rather than auth.uid().
create or replace function public.get_creator_stats(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if p_user is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'reviews_written',  (select count(*) from public.reviews where user_id = p_user and status = 'published'),
    'photos_shared',    (select coalesce(sum(cardinality(photo_urls)), 0) from public.reviews where user_id = p_user and status = 'published'),
    'helpful_received', (select coalesce(sum(helpful_count), 0) from public.reviews where user_id = p_user and status = 'published'),
    'answers_given',    (select count(*) from public.answers where user_id = p_user),
    'questions_asked',  (select count(*) from public.questions where user_id = p_user and status = 'published'),
    'verified_visits',  (select count(*) from public.reviews where user_id = p_user and is_verified_visitor and status = 'published')
  );
end $$;
grant execute on function public.get_creator_stats(uuid) to anon, authenticated;

-- ============================================================================
-- 4) Aggregate community rating onto venues/events (our own social evidence,
-- distinct from Google's rating). Denormalized via trigger for cheap card reads.
-- ============================================================================
alter table public.venues add column if not exists community_rating numeric;
alter table public.venues add column if not exists community_review_count integer not null default 0;
alter table public.events add column if not exists community_rating numeric;
alter table public.events add column if not exists community_review_count integer not null default 0;

create or replace function public.sync_community_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_venue uuid := coalesce(new.venue_id, old.venue_id);
  v_event uuid := coalesce(new.event_id, old.event_id);
begin
  if v_venue is not null then
    update public.venues v set
      community_review_count = (select count(*) from public.reviews r where r.venue_id = v_venue and r.status = 'published'),
      community_rating       = (select round(avg(rating)::numeric, 1) from public.reviews r where r.venue_id = v_venue and r.status = 'published')
    where v.id = v_venue;
  end if;
  if v_event is not null then
    update public.events e set
      community_review_count = (select count(*) from public.reviews r where r.event_id = v_event and r.status = 'published'),
      community_rating       = (select round(avg(rating)::numeric, 1) from public.reviews r where r.event_id = v_event and r.status = 'published')
    where e.id = v_event;
  end if;
  return null;
end $$;
drop trigger if exists trg_community_rating on public.reviews;
create trigger trg_community_rating after insert or update or delete on public.reviews
  for each row execute function public.sync_community_rating();
