-- Stage 5B — Explorer Passport + experience-earned messaging.
--
-- Two ideas, one philosophy: experiences create relationships, not the other way round.
--
-- 1) A profile stops being a follower count and becomes a PASSPORT: how this person
--    actually explores — verified experiences, cities, categories, streak, the
--    blueprints others copied. explorer_passport() computes it from tables that
--    already exist; nothing here invents a stat the app can't back up.
--
-- 2) Messaging is EARNED and CONTEXTUAL. A conversation may always begin from a
--    specific experience (a post or a story) — that's the "Ask about this experience"
--    path, and it carries its origin in the row. A cold, context-free DM to a stranger
--    is only possible once the sender has actually explored: one verified experience or
--    one completed outing. Enforced by a trigger, not by hiding a button, so the rule
--    holds no matter which client is talking to the database.
--
-- APPLY VIA THE SUPABASE SQL EDITOR. Do NOT `db push` (migration history desynced).
-- Idempotent: safe to re-run.
--
-- ORDER MATTERS. This file reads columns two earlier pending migrations create, and
-- will fail outright without them:
--   20260722120000_blueprints.sql   -> collaborative_trips.clone_count
--   20260801120000_experience_posts -> posts.verification, posts.post-side columns
-- Apply in filename order: blueprints -> trip_fields -> experience_posts -> this file.

-- ============================================================================
-- 1) CONVERSATION ORIGIN — every thread can say why it exists.
-- ============================================================================
alter table public.direct_messages add column if not exists post_id uuid references public.posts(id) on delete set null;

-- ============================================================================
-- 2) EXPLORER CREDITS — what "has actually explored" means, in one place so the
--    passport and the messaging gate can never drift apart.
--    A credit = a server-verified experience, or an outing that has already happened.
-- ============================================================================
create or replace function public.explorer_credits(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.posts p
      where p.user_id = p_user and p.status = 'published' and p.verification = 'verified')
  + (select count(*) from public.trip_participants tp
      join public.collaborative_trips t on t.id = tp.trip_id
     where tp.user_id = p_user
       and coalesce(t.end_date, t.start_date) is not null
       and coalesce(t.end_date, t.start_date) < current_date);
$$;
grant execute on function public.explorer_credits(uuid) to anon, authenticated;

-- ============================================================================
-- 3) THE PASSPORT
-- ============================================================================
create or replace function public.explorer_passport(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_experiences int; v_verified int; v_reviews int; v_answers int; v_helpful int;
  v_blueprints int; v_clones int; v_outings int; v_credits int;
  v_cities text[]; v_categories text[]; v_streak int; v_since date;
  v_points int; v_level int;
begin
  select count(*), min(created_at)::date
    into v_experiences, v_since
    from public.posts where user_id = p_user and status = 'published';

  select count(*) into v_verified
    from public.posts where user_id = p_user and status = 'published' and verification = 'verified';

  select count(*), coalesce(sum(helpful_count), 0) into v_reviews, v_helpful
    from public.reviews where user_id = p_user and status = 'published';

  select count(*) into v_answers from public.answers where user_id = p_user;

  select count(*), coalesce(sum(clone_count), 0) into v_blueprints, v_clones
    from public.collaborative_trips where created_by = p_user and is_public;

  select count(*) into v_outings
    from public.trip_participants where user_id = p_user;

  v_credits := public.explorer_credits(p_user);

  -- Cities and categories come from the places the user actually posted about or
  -- reviewed — never from a self-declared bio.
  select coalesce(array_agg(distinct city order by city), '{}'::text[]) into v_cities from (
    select v.city from public.posts p join public.venues v on v.id = p.venue_id
      where p.user_id = p_user and p.status = 'published' and v.city is not null
    union
    select v.city from public.reviews r join public.venues v on v.id = r.venue_id
      where r.user_id = p_user and r.status = 'published' and v.city is not null
  ) c;

  select coalesce(array_agg(category order by n desc), '{}'::text[]) into v_categories from (
    select v.category as category, count(*) as n
      from public.posts p join public.venues v on v.id = p.venue_id
     where p.user_id = p_user and p.status = 'published' and v.category is not null
     group by v.category order by n desc limit 3
  ) t;

  -- Streak: consecutive weeks with at least one experience, counting back from the
  -- most recent one. Broken (0) if they haven't posted this week or last — a streak
  -- that survives a month of silence isn't a streak.
  with weeks as (
    select distinct date_trunc('week', created_at)::date as w
      from public.posts where user_id = p_user and status = 'published'
  ), ranked as (
    select w, row_number() over (order by w desc) as rn from weeks
  )
  select count(*) into v_streak from ranked
   where (select max(w) from weeks) >= date_trunc('week', now())::date - 7
     and w = (select max(w) from weeks) - ((rn - 1) * 7);

  -- Level rewards the things Purday wants more of: verified presence, blueprints
  -- other people actually copied, real outings. Square-rooted so it climbs steadily
  -- instead of running away from a heavy poster.
  v_points := v_experiences * 2 + v_verified * 5 + v_reviews * 3 + v_answers * 2
            + coalesce(v_helpful, 0) + v_blueprints * 10 + v_clones * 3 + v_outings * 4;
  v_level := greatest(1, floor(sqrt(greatest(v_points, 0)))::int);

  return jsonb_build_object(
    'experiences', v_experiences,
    'verified',    v_verified,
    'reviews',     v_reviews,
    'answers',     v_answers,
    'helpful',     coalesce(v_helpful, 0),
    'blueprints',  v_blueprints,
    'clones',      v_clones,
    'outings',     v_outings,
    'credits',     v_credits,
    'cities',      to_jsonb(coalesce(v_cities, '{}'::text[])),
    'categories',  to_jsonb(coalesce(v_categories, '{}'::text[])),
    'streak_weeks', coalesce(v_streak, 0),
    'since',       v_since,
    'level',       v_level,
    -- The progression ladder. Chat is earned; groups and public meetups come later.
    'unlocks', jsonb_build_object(
      'chat',    v_credits >= 1,
      'groups',  v_credits >= 5,
      'meetups', v_credits >= 20
    )
  );
end $$;
grant execute on function public.explorer_passport(uuid) to anon, authenticated;

-- ============================================================================
-- 4) THE MESSAGING GATE
--    Order matters: contextual first (a conversation that starts FROM an experience
--    is always allowed — that's the product), then existing threads (never trap
--    someone who was messaged first), and only then the earned-status requirement.
-- ============================================================================
create or replace function public.enforce_explorer_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 1. Started from a specific experience — the intended path.
  if new.post_id is not null or new.story_id is not null then
    return new;
  end if;

  -- 2. A thread already exists between these two, in either direction. Replying is
  --    always allowed, otherwise a new explorer could be messaged and not answer back.
  if exists (
    select 1 from public.direct_messages m
     where (m.sender_id = new.sender_id and m.recipient_id = new.recipient_id)
        or (m.sender_id = new.recipient_id and m.recipient_id = new.sender_id)
  ) then
    return new;
  end if;

  -- 3. A cold open must be earned.
  if public.explorer_credits(new.sender_id) < 1 then
    raise exception 'Explorer Chat is locked — share a verified experience or complete an outing first'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists trg_enforce_explorer_chat on public.direct_messages;
create trigger trg_enforce_explorer_chat before insert on public.direct_messages
  for each row execute function public.enforce_explorer_chat();
