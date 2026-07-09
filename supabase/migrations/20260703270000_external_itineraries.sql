-- External itinerary logs: the third RAG source. Free-text trip descriptions
-- synced from outside (Instagram captions, blogs, manual notes). These carry NO
-- catalog ids -- they are creative INSPIRATION for the curator only; every real
-- suggestion must still map to a verified venue/event/blueprint id.
create table if not exists public.external_itineraries (
  id uuid primary key default gen_random_uuid(),
  market text not null,
  source text not null default 'manual',      -- instagram | blog | manual | seed
  title text,
  body text not null,
  tags text[] not null default '{}',
  external_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_external_itin_market on public.external_itineraries (market);
create index if not exists idx_external_itin_body_trgm on public.external_itineraries using gin (body gin_trgm_ops);

alter table public.external_itineraries enable row level security;
drop policy if exists "external read" on public.external_itineraries;
drop policy if exists "external admin write" on public.external_itineraries;
create policy "external read"        on public.external_itineraries for select using (true);
create policy "external admin write" on public.external_itineraries for all using (public.is_admin()) with check (public.is_admin());

-- Seed a few vibe-rich logs so the pipeline demonstrably pulls a third source.
insert into public.external_itineraries (market, source, title, body, tags) values
  ('DZ', 'seed', 'Algiers adrenaline day with the crew',
   'We went hard: morning karting session, then paintball with the boys, a huge grilled mixed-grill lunch, cliff views at sunset, and a late authentic casbah dinner. High energy the whole way, zero museums.',
   array['adventure','intense','thrill','food']),
  ('DZ', 'seed', 'Algiers food crawl',
   'Traditional breakfast, mechoui and grilled lamb for lunch, patisserie stop, then seafood dinner by the port at golden hour.',
   array['food','foodie']),
  ('ZW', 'seed', 'Harare thrill day',
   'Fantasia Land rides all morning, go-karting, an adventure/adrenaline park, then a big braai dinner to close the night.',
   array['adventure','thrill','intense'])
on conflict do nothing;
