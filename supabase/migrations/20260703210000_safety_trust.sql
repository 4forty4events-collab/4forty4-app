-- Safety, Security & Trust — data layer. Community reporting with an admin status
-- workflow, admin-gated trust tiers on profiles (with anti-self-elevation), and a
-- read-heavy localized emergency/safety registry.

-- ============================================================================
-- 1) REPORTS — flag a venue / event / organizer
-- ============================================================================
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('venue', 'event', 'organizer')),
  venue_id uuid references public.venues(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  organizer_id uuid references public.organizers(id) on delete cascade,
  reason text not null check (reason in ('scam', 'abuse', 'incorrect_details', 'safety', 'spam', 'other')),
  details text,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'actioned', 'dismissed')),
  resolution_note text,
  handled_by uuid,
  handled_at timestamptz,
  market text,
  created_at timestamptz not null default now(),
  constraint reports_one_target check (num_nonnulls(venue_id, event_id, organizer_id) = 1)
);
create index if not exists idx_reports_reporter on public.reports (reporter_id, created_at desc);
create index if not exists idx_reports_queue on public.reports (status, created_at desc);
create index if not exists idx_reports_venue on public.reports (venue_id);
create index if not exists idx_reports_event on public.reports (event_id);
create index if not exists idx_reports_organizer on public.reports (organizer_id);

alter table public.reports enable row level security;
drop policy if exists "reports read own or admin" on public.reports;
drop policy if exists "reports insert own" on public.reports;
drop policy if exists "reports admin update" on public.reports;
drop policy if exists "reports admin delete" on public.reports;
-- Users see ONLY their own reports; admins see/manage all.
create policy "reports read own or admin" on public.reports for select using (auth.uid() = reporter_id or public.is_admin());
create policy "reports insert own"        on public.reports for insert with check (auth.uid() = reporter_id);
create policy "reports admin update"      on public.reports for update using (public.is_admin()) with check (public.is_admin());
create policy "reports admin delete"      on public.reports for delete using (public.is_admin());

-- Admin status workflow (pending -> reviewing -> actioned/dismissed).
create or replace function public.resolve_report(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.'; end if;
  if p_status not in ('pending', 'reviewing', 'actioned', 'dismissed') then raise exception 'Bad status.'; end if;
  update public.reports
  set status = p_status, resolution_note = p_note,
      handled_by = auth.uid(), handled_at = now()
  where id = p_id;
end $$;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;

-- ============================================================================
-- 2) TRUST TIERS — a verification level per user (admin-issued/revoked)
-- ============================================================================
alter table public.profiles add column if not exists trust_tier text not null default 'standard'
  check (trust_tier in ('standard', 'verified_citizen', 'community_guide'));
alter table public.profiles add column if not exists trust_verified_at timestamptz;
alter table public.profiles add column if not exists trust_verified_by uuid;

-- Anti-self-elevation: only an admin may change the trust fields (a user editing
-- their own profile can't promote themselves).
create or replace function public.protect_trust_tier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.trust_tier := old.trust_tier;
    new.trust_verified_at := old.trust_verified_at;
    new.trust_verified_by := old.trust_verified_by;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_trust_tier on public.profiles;
create trigger trg_protect_trust_tier before update on public.profiles
  for each row execute function public.protect_trust_tier();

create or replace function public.set_trust_tier(p_user uuid, p_tier text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.'; end if;
  if p_tier not in ('standard', 'verified_citizen', 'community_guide') then raise exception 'Bad tier.'; end if;
  update public.profiles
  set trust_tier = p_tier,
      trust_verified_at = case when p_tier <> 'standard' then now() else null end,
      trust_verified_by = case when p_tier <> 'standard' then auth.uid() else null end
  where id = p_user;
end $$;
grant execute on function public.set_trust_tier(uuid, text) to authenticated;

-- Expose the tier as a public trust signal (extends the display-only view).
create or replace view public.public_profiles as
  select id, full_name, avatar_url, trust_tier from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- ============================================================================
-- 3) SAFETY REGISTRY — read-heavy, market/region indexed, public + offline-ready
-- ============================================================================
create table if not exists public.safety_contacts (
  id uuid primary key default gen_random_uuid(),
  market text not null,
  region text,                      -- null = country-wide
  category text not null check (category in
    ('police', 'ambulance', 'fire', 'civil_protection', 'emergency', 'embassy', 'health', 'womens_helpline', 'child_helpline', 'roadside', 'other')),
  name text not null,
  phone text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_safety_market on public.safety_contacts (market, sort_order) where is_active;

alter table public.safety_contacts enable row level security;
drop policy if exists "safety read" on public.safety_contacts;
drop policy if exists "safety admin write" on public.safety_contacts;
create policy "safety read"        on public.safety_contacts for select using (is_active or public.is_admin());
create policy "safety admin write" on public.safety_contacts for all using (public.is_admin()) with check (public.is_admin());

-- Seed the essential country-wide numbers (verify/expand as markets grow).
insert into public.safety_contacts (market, category, name, phone, sort_order) values
  ('DZ', 'police', 'Police (Sûreté Nationale)', '17', 1),
  ('DZ', 'civil_protection', 'Protection Civile (fire / rescue)', '14', 2),
  ('DZ', 'ambulance', 'SAMU (medical emergency)', '115', 3),
  ('DZ', 'police', 'Gendarmerie Nationale', '1055', 4),
  ('ZW', 'police', 'Police', '995', 1),
  ('ZW', 'ambulance', 'Ambulance', '994', 2),
  ('ZW', 'fire', 'Fire', '993', 3)
on conflict do nothing;
