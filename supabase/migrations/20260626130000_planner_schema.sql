-- Budget Planner — Stage A schema.
-- Normalized pricing on venues+events (price_per_person is the ONLY field the
-- planner math/auto-build reads), plus the two planner tables.

-- 1) Pricing columns on BOTH tables. Note: venues have no legacy `price` column
-- (only price_level), so there's nothing to backfill price_per_person from there
-- — it stays null until an admin sets it via the edit form. Events DO have price.
alter table public.venues
  add column if not exists price_per_person numeric,
  add column if not exists price_type text,
  add column if not exists price_max numeric,
  add column if not exists duration_days integer not null default 1;

alter table public.events
  add column if not exists price_per_person numeric,
  add column if not exists price_type text,
  add column if not exists price_max numeric,
  add column if not exists duration_days integer not null default 1;

-- price_type domain (same on both tables).
alter table public.venues drop constraint if exists venues_price_type_check;
alter table public.venues add constraint venues_price_type_check
  check (price_type is null or price_type in ('per_person','per_group','per_day','per_night','from','free'));
alter table public.events drop constraint if exists events_price_type_check;
alter table public.events add constraint events_price_type_check
  check (price_type is null or price_type in ('per_person','per_group','per_day','per_night','from','free'));

-- 2) Backfill events from the existing display price. duration_days already
-- defaulted to 1 for existing rows via the column default.
update public.events
set price_per_person = price,
    price_type = case when price is not null then 'per_person' else price_type end
where price_per_person is null;

-- 3) Planner tables. Stage 1 scaffolded DZD-only, single-market versions of
-- these (no market/plan_type/currency/event_id/source) that are structurally
-- incompatible with the dual-market planner. Both are empty, so replace them
-- with the real shape. Items dropped first (FK to plans).
drop table if exists public.budget_items;
drop table if exists public.budget_plans;

create table public.budget_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  total_budget numeric not null,
  currency text,
  market text not null,
  plan_type text not null check (plan_type in ('single_day','trip')),
  created_at timestamptz not null default now()
);

create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.budget_plans(id) on delete cascade,
  -- Same two-nullable-FK shape as saved_items; exactly one set per row.
  venue_id uuid references public.venues(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  -- Frozen snapshot of price_per_person at add-time: the plan total must NOT
  -- move if the listing's price is later edited.
  est_cost numeric,
  source text not null default 'manual' check (source in ('manual','auto')),
  created_at timestamptz not null default now()
);

-- Dedup: one listing per plan (partial uniques, NULL-safe — see saved_items).
create unique index if not exists budget_items_plan_venue_uniq
  on public.budget_items (plan_id, venue_id) where venue_id is not null;
create unique index if not exists budget_items_plan_event_uniq
  on public.budget_items (plan_id, event_id) where event_id is not null;

-- RLS: plans are owner-only; items inherit ownership through their plan.
alter table public.budget_plans enable row level security;
alter table public.budget_items enable row level security;

drop policy if exists "own plans" on public.budget_plans;
create policy "own plans" on public.budget_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own budget items" on public.budget_items;
create policy "own budget items" on public.budget_items
  for all
  using (exists (select 1 from public.budget_plans p where p.id = plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.budget_plans p where p.id = plan_id and p.user_id = auth.uid()));

-- 4) Thread the 4 normalized pricing fields through publish_*/update_*. Drop the
-- prior exact signatures first so PostgREST never sees an ambiguous overload.
drop function if exists public.publish_venue(uuid, text, text, text[], text, text, text, text, text, text, text);
drop function if exists public.update_venue(uuid, text, text, text[], text, text, text, text, text, text, text, boolean);
drop function if exists public.publish_event(uuid, text, text, text[], text, text, date, text, numeric, text, text, text, text, text, text, text);
drop function if exists public.update_event(uuid, text, text, text[], text, text, date, text, numeric, text, text, text, text, text, text, text);

create or replace function public.publish_venue(
  p_draft_id uuid,
  p_title text,
  p_category text,
  p_tags text[],
  p_description text,
  p_address text,
  p_market text,
  p_cover_image_url text default null,
  p_contact_whatsapp text default null,
  p_contact_phone text default null,
  p_contact_instagram text default null,
  p_price_per_person numeric default null,
  p_price_type text default null,
  p_price_max numeric default null,
  p_duration_days integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  insert into public.venues (
    name, category, tags, description, address, market, cover_image_url,
    contact_whatsapp, contact_phone, contact_instagram,
    price_per_person, price_type, price_max, duration_days
  )
  values (
    p_title, p_category, coalesce(p_tags, '{}'), p_description, p_address, p_market, p_cover_image_url,
    p_contact_whatsapp, p_contact_phone, p_contact_instagram,
    p_price_per_person, p_price_type, p_price_max, coalesce(p_duration_days, 1)
  )
  returning id into v_venue_id;

  update public.content_drafts
  set status = 'published',
      published_venue_id = v_venue_id,
      updated_at = now()
  where id = p_draft_id;

  return v_venue_id;
end;
$$;

create or replace function public.update_venue(
  p_id uuid,
  p_title text,
  p_category text,
  p_tags text[],
  p_description text,
  p_address text,
  p_market text,
  p_cover_image_url text,
  p_contact_whatsapp text,
  p_contact_phone text,
  p_contact_instagram text,
  p_is_stub boolean,
  p_price_per_person numeric default null,
  p_price_type text default null,
  p_price_max numeric default null,
  p_duration_days integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  update public.venues
  set name = p_title,
      category = p_category,
      tags = coalesce(p_tags, '{}'),
      description = p_description,
      address = p_address,
      market = p_market,
      cover_image_url = p_cover_image_url,
      contact_whatsapp = p_contact_whatsapp,
      contact_phone = p_contact_phone,
      contact_instagram = p_contact_instagram,
      is_stub = coalesce(p_is_stub, false),
      price_per_person = p_price_per_person,
      price_type = p_price_type,
      price_max = p_price_max,
      duration_days = coalesce(p_duration_days, 1)
  where id = p_id;

  return p_id;
end;
$$;

create or replace function public.publish_event(
  p_draft_id uuid,
  p_title text,
  p_category text,
  p_tags text[],
  p_description text,
  p_venue_name text,
  p_event_date date,
  p_event_time text,
  p_price numeric,
  p_price_note text,
  p_currency text,
  p_market text,
  p_cover_image_url text default null,
  p_contact_whatsapp text default null,
  p_contact_phone text default null,
  p_contact_instagram text default null,
  p_price_per_person numeric default null,
  p_price_type text default null,
  p_price_max numeric default null,
  p_duration_days integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_venue_id uuid;
  v_venue_city text;
  v_event_id uuid;
  v_tz text;
  v_time time;
  v_start_time timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  v_norm := lower(regexp_replace(btrim(p_venue_name), '\s+', ' ', 'g'));

  select id, city into v_venue_id, v_venue_city
  from public.venues
  where lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = v_norm
    and market = p_market
  limit 1;

  if v_venue_id is null then
    insert into public.venues (name, market, category, tags, description, address, is_stub)
    values (p_venue_name, p_market, 'other', '{}', null, null, true)
    returning id, city into v_venue_id, v_venue_city;
  end if;

  v_tz := case p_market when 'DZ' then 'Africa/Algiers' else 'Africa/Harare' end;

  begin
    v_time := p_event_time::time;
  exception when others then
    v_time := null;
  end;

  if p_event_date is not null then
    v_start_time := (p_event_date + coalesce(v_time, time '00:00')) at time zone v_tz;
  end if;

  insert into public.events (
    venue_id, created_by, title, description, category, tags,
    start_time, price, price_note, currency, price_dzd, is_free,
    market, city, cover_image_url,
    contact_whatsapp, contact_phone, contact_instagram,
    price_per_person, price_type, price_max, duration_days
  )
  values (
    v_venue_id, auth.uid(), p_title, p_description, p_category, coalesce(p_tags, '{}'),
    v_start_time, p_price, p_price_note, p_currency,
    case when p_currency = 'DZD' then p_price end,
    (p_price is null and 'free' = any(coalesce(p_tags, '{}'))),
    p_market, v_venue_city, p_cover_image_url,
    p_contact_whatsapp, p_contact_phone, p_contact_instagram,
    p_price_per_person, p_price_type, p_price_max, coalesce(p_duration_days, 1)
  )
  returning id into v_event_id;

  update public.content_drafts
  set status = 'published',
      published_event_id = v_event_id,
      published_venue_id = v_venue_id,
      updated_at = now()
  where id = p_draft_id;

  return v_event_id;
end;
$$;

create or replace function public.update_event(
  p_id uuid,
  p_title text,
  p_category text,
  p_tags text[],
  p_description text,
  p_venue_name text,
  p_event_date date,
  p_event_time text,
  p_price numeric,
  p_price_note text,
  p_currency text,
  p_market text,
  p_cover_image_url text,
  p_contact_whatsapp text,
  p_contact_phone text,
  p_contact_instagram text,
  p_price_per_person numeric default null,
  p_price_type text default null,
  p_price_max numeric default null,
  p_duration_days integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_venue_id uuid;
  v_venue_city text;
  v_tz text;
  v_time time;
  v_start_time timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  v_norm := lower(regexp_replace(btrim(p_venue_name), '\s+', ' ', 'g'));

  select id, city into v_venue_id, v_venue_city
  from public.venues
  where lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = v_norm
    and market = p_market
  limit 1;

  if v_venue_id is null then
    insert into public.venues (name, market, category, tags, description, address, is_stub)
    values (p_venue_name, p_market, 'other', '{}', null, null, true)
    returning id, city into v_venue_id, v_venue_city;
  end if;

  v_tz := case p_market when 'DZ' then 'Africa/Algiers' else 'Africa/Harare' end;

  begin
    v_time := p_event_time::time;
  exception when others then
    v_time := null;
  end;

  if p_event_date is not null then
    v_start_time := (p_event_date + coalesce(v_time, time '00:00')) at time zone v_tz;
  end if;

  update public.events
  set venue_id = v_venue_id,
      title = p_title,
      description = p_description,
      category = p_category,
      tags = coalesce(p_tags, '{}'),
      start_time = v_start_time,
      price = p_price,
      price_note = p_price_note,
      currency = p_currency,
      price_dzd = case when p_currency = 'DZD' then p_price end,
      is_free = (p_price is null and 'free' = any(coalesce(p_tags, '{}'))),
      market = p_market,
      city = v_venue_city,
      cover_image_url = p_cover_image_url,
      contact_whatsapp = p_contact_whatsapp,
      contact_phone = p_contact_phone,
      contact_instagram = p_contact_instagram,
      price_per_person = p_price_per_person,
      price_type = p_price_type,
      price_max = p_price_max,
      duration_days = coalesce(p_duration_days, 1)
  where id = p_id;

  return p_id;
end;
$$;
