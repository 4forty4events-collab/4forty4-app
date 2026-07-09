-- Reusable admin check
create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- The drafts staging table
create table public.content_drafts (
  id            uuid primary key default gen_random_uuid(),
  created_by    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  status        text not null default 'pending_review'
                check (status in ('pending_review','published','discarded')),
  market        text not null check (market in ('DZ','ZW')),
  raw_caption   text not null,
  ai_output     jsonb,
  target_type   text not null check (target_type in ('venue','event')),
  title         text,
  category      text check (category in (
                  'restaurant','cafe','nightlife','music_event','festival','sports',
                  'outdoor','tourism','hotel','shopping','wellness','culture',
                  'entertainment','education','meetup','other')),
  tags          text[] not null default '{}',
  venue_name    text,
  description   text,
  event_date    date,
  event_time    text,
  price         numeric,
  price_note    text,
  currency      text check (currency in ('DZD','USD')),
  address       text,
  published_venue_id uuid references public.venues(id) on delete set null,
  published_event_id uuid references public.events(id) on delete set null
);

create index content_drafts_status_idx on public.content_drafts(status);
alter table public.content_drafts enable row level security;

create policy "admins manage drafts" on public.content_drafts
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admins insert venues" on public.venues for insert with check (public.is_admin());
create policy "admins insert events" on public.events for insert with check (public.is_admin());
