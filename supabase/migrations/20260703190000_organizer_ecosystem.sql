-- Organizer & Creator Ecosystem — data layer. A dedicated organizers entity
-- (branding + verification), ownership links from venues/events, listing-
-- management RLS so owners edit only their own, and an analytics aggregation RPC
-- built on the existing interactions log.

-- ============================================================================
-- 1) ORGANIZERS
-- ============================================================================
create table if not exists public.organizers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  logo_url text,
  cover_url text,
  contact_email text,
  contact_phone text,
  contact_whatsapp text,
  website text,
  instagram text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  verified_at timestamptz,
  verified_by uuid,
  market text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_organizers_owner on public.organizers (owner_id);

alter table public.organizers enable row level security;
drop policy if exists "organizers read" on public.organizers;
drop policy if exists "organizers insert own" on public.organizers;
drop policy if exists "organizers update own" on public.organizers;
drop policy if exists "organizers delete own" on public.organizers;
create policy "organizers read"       on public.organizers for select using (verification_status = 'verified' or auth.uid() = owner_id);
create policy "organizers insert own" on public.organizers for insert with check (auth.uid() = owner_id);
create policy "organizers update own" on public.organizers for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "organizers delete own" on public.organizers for delete using (auth.uid() = owner_id);

-- Prevent self-verification: only an admin may change the verification fields.
-- (An owner can edit branding/contact freely; status is gated.)
create or replace function public.protect_organizer_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_protect_organizer_verification on public.organizers;
create trigger trg_protect_organizer_verification before update on public.organizers
  for each row execute function public.protect_organizer_verification();

create or replace function public.verify_organizer(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.'; end if;
  if p_status not in ('unverified', 'pending', 'verified', 'rejected') then raise exception 'Bad status.'; end if;
  update public.organizers
  set verification_status = p_status,
      verified_at = case when p_status = 'verified' then now() else null end,
      verified_by = case when p_status = 'verified' then auth.uid() else null end
  where id = p_id;
end $$;

-- ============================================================================
-- 2) OWNERSHIP LINKS + LISTING MANAGEMENT
-- ============================================================================
alter table public.venues add column if not exists organizer_id uuid references public.organizers(id) on delete set null;
alter table public.events add column if not exists organizer_id uuid references public.organizers(id) on delete set null;
create index if not exists idx_venues_organizer on public.venues (organizer_id);
create index if not exists idx_events_organizer on public.events (organizer_id);

-- Owners may edit their own venues, and fully manage (insert/update/delete) their
-- own events. These are additive (OR'd) to the existing admin/public policies.
drop policy if exists "organizers update own venues" on public.venues;
create policy "organizers update own venues" on public.venues for update
  using (organizer_id in (select id from public.organizers where owner_id = auth.uid()))
  with check (organizer_id in (select id from public.organizers where owner_id = auth.uid()));

drop policy if exists "organizers manage own events" on public.events;
create policy "organizers manage own events" on public.events for all
  using (organizer_id in (select id from public.organizers where owner_id = auth.uid()))
  with check (organizer_id in (select id from public.organizers where owner_id = auth.uid()));

-- Claim an unclaimed venue for one of your organizers (real trust still gates on
-- verification). Keeps the legacy is_claimed/claimed_by in sync.
create or replace function public.claim_venue(p_venue uuid, p_organizer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.organizers where id = p_organizer and owner_id = auth.uid()) then
    raise exception 'Not your organizer.';
  end if;
  update public.venues
  set organizer_id = p_organizer, is_claimed = true, claimed_by = auth.uid()
  where id = p_venue and organizer_id is null;
  if not found then raise exception 'Venue is not available to claim.'; end if;
end $$;
grant execute on function public.claim_venue(uuid, uuid) to authenticated;

-- ============================================================================
-- 3) ANALYTICS — check-ins as a new interaction type + a time-series aggregator
-- ============================================================================
alter table public.interactions drop constraint if exists interactions_type_check;
alter table public.interactions add constraint interactions_type_check
  check (type in ('view', 'save', 'plan_add', 'check_in'));

-- Owner/admin-gated analytics for one listing: totals + daily buckets of views /
-- saves / check-ins over the last p_days, aggregated from the interactions log.
create or replace function public.get_listing_analytics(p_kind text, p_id uuid, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ok boolean;
  v_from timestamptz := now() - (greatest(p_days, 1) || ' days')::interval;
begin
  if p_kind = 'venue' then
    v_ok := public.is_admin() or exists (
      select 1 from public.venues v join public.organizers o on o.id = v.organizer_id
      where v.id = p_id and o.owner_id = auth.uid());
  else
    v_ok := public.is_admin() or exists (
      select 1 from public.events e join public.organizers o on o.id = e.organizer_id
      where e.id = p_id and o.owner_id = auth.uid());
  end if;
  if not v_ok then raise exception 'Not authorized.'; end if;

  return jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'views',     count(*) filter (where type = 'view'),
        'saves',     count(*) filter (where type = 'save'),
        'check_ins', count(*) filter (where type = 'check_in'))
      from public.interactions
      where (case when p_kind = 'venue' then venue_id else event_id end) = p_id),
    'daily', coalesce((
      select jsonb_agg(row order by (row->>'date'))
      from (
        select jsonb_build_object(
          'date', date_trunc('day', created_at)::date,
          'views',     count(*) filter (where type = 'view'),
          'saves',     count(*) filter (where type = 'save'),
          'check_ins', count(*) filter (where type = 'check_in')) as row
        from public.interactions
        where (case when p_kind = 'venue' then venue_id else event_id end) = p_id
          and created_at >= v_from
        group by date_trunc('day', created_at)::date
      ) buckets), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_listing_analytics(text, uuid, integer) to authenticated;
