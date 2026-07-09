-- User Profile & Settings foundation (data layer only).
--   1) Rich profile metadata on profiles (interests, favorite categories, langs).
--   2) user_settings (1:1): privacy + notification preferences — structured, not
--      jsonb, so each toggle is queryable/validatable.
--   3) Derived travel stats (no stored counters to drift) + account deletion.

-- 1) Profile metadata. Arrays default to empty so every profile has a concrete
-- (never-null) shape. Element validity (favorite_categories subset of the 16
-- categories, language codes) is enforced in the repository, not with array
-- element checks.
alter table public.profiles
  add column if not exists interests text[] not null default '{}',
  add column if not exists favorite_categories text[] not null default '{}',
  add column if not exists languages text[] not null default '{}',
  add column if not exists bio text;

-- 2) Settings, one row per user. FK cascades with the auth user.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- privacy & data
  profile_visibility text not null default 'private'
    check (profile_visibility in ('public', 'private')),
  share_activity boolean not null default false,       -- activity visible to others
  personalized_recs boolean not null default true,     -- allow using interactions for For You
  -- notifications
  notify_event_reminders boolean not null default true,
  notify_nearby boolean not null default true,
  notify_recommendations boolean not null default true,
  notify_organizer_updates boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Backfill settings for existing users (defaults).
insert into public.user_settings (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- New users get a profile AND a settings row on signup (extends the existing
-- signup trigger; profile logic unchanged from the OAuth migration).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, email, full_name, avatar_url)
  values (
    new.id,
    new.phone,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- 3a) Travel stats — DERIVED from real signals (interactions/saves/plans), so
-- they can't drift. "Explored" = distinct venues the user has engaged with;
-- true check-in "visited" is a future capability. Uses auth.uid() (own only).
create or replace function public.get_travel_stats(p_market text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'places_explored', (
      select count(distinct i.venue_id) from public.interactions i
      where i.user_id = v_uid and i.venue_id is not null
        and (p_market is null or i.market = p_market)),
    'places_saved', (
      select count(*) from public.saved_items s
      where s.user_id = v_uid and s.venue_id is not null),
    'events_saved', (
      select count(*) from public.saved_items s
      where s.user_id = v_uid and s.event_id is not null),
    'plans_created', (
      select count(*) from public.budget_plans p where p.user_id = v_uid),
    'categories_explored', (
      select count(distinct v.category) from public.interactions i
      join public.venues v on v.id = i.venue_id
      where i.user_id = v_uid and v.category is not null),
    'top_category', (
      select v.category from public.interactions i
      join public.venues v on v.id = i.venue_id
      where i.user_id = v_uid and v.category is not null
      group by v.category order by count(*) desc limit 1)
  );
end $$;

-- 3b) Account deletion — the user erases themselves. saved_items has no FK
-- cascade to auth.users, so clear it explicitly; deleting the auth user then
-- cascades profile, settings, interactions, and plans.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated.'; end if;
  delete from public.saved_items where user_id = v_uid;
  delete from auth.users where id = v_uid;
end $$;

grant execute on function public.get_travel_stats(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
