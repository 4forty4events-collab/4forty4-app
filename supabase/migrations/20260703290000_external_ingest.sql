-- External itineraries ingestion pipeline: optimize the store for scraped/shared
-- social payloads (Instagram) + an internal RPC that cleans and upserts them.

alter table public.external_itineraries add column if not exists handle text;          -- @account
alter table public.external_itineraries add column if not exists location_text text;    -- parsed place text
alter table public.external_itineraries add column if not exists media_urls text[] not null default '{}';

-- Dedup on the source URL (NULLs stay distinct, so manual rows are unaffected).
create unique index if not exists idx_external_url_uniq on public.external_itineraries (external_url);

-- Internal ingestion interface. Cleans the caption (collapse whitespace, cap length),
-- harvests #hashtags into tags, and upserts by external_url. Backend/service-role
-- only (revoked from clients) -- a scraper or admin importer calls it.
create or replace function public.ingest_external_itinerary(
  p_market text,
  p_body text,
  p_source text default 'instagram',
  p_handle text default null,
  p_url text default null,
  p_location_text text default null,
  p_media_urls text[] default null,
  p_tags text[] default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_clean text;
  v_tags text[];
  v_id uuid;
begin
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'body required'; end if;

  -- collapse whitespace, trim, cap length
  v_clean := left(btrim(regexp_replace(p_body, '\s+', ' ', 'g')), 2000);

  -- provided tags + hashtags harvested from the caption (lowercased, no '#')
  v_tags := coalesce(p_tags, '{}') || coalesce((
    select array_agg(distinct lower(substring(m[1] from 2)))
    from regexp_matches(p_body, '(#[A-Za-z0-9_]+)', 'g') as m
  ), '{}');

  insert into public.external_itineraries (market, source, handle, external_url, body, location_text, media_urls, tags)
  values (p_market, coalesce(p_source, 'instagram'), p_handle, p_url, v_clean, p_location_text, coalesce(p_media_urls, '{}'), v_tags)
  on conflict (external_url) do update
    set body = excluded.body, tags = excluded.tags, handle = excluded.handle,
        location_text = excluded.location_text, media_urls = excluded.media_urls
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.ingest_external_itinerary(text, text, text, text, text, text, text[], text[]) from public, anon, authenticated;

-- ---- mock sync: a realistic batch of trending Algiers social posts -----------
select public.ingest_external_itinerary(v.market, v.body, 'instagram', v.handle, v.url, v.loc, null, v.tags)
from (values
  ('DZ', 'Hidden gem alert. This cozy rooftop cafe in El Achour has the best sunset view over Algiers. Perfect chill romantic spot for a date night. #algiers #rooftop #romantic #cafe #view #elachour #hiddengem',
   '@algiers.foodies', 'https://instagram.com/p/dz-reel-1', 'El Achour, Algiers', array['rooftop','romantic','cafe','view']),
  ('DZ', 'The most HYPE brunch in Hydra right now, everyone is going. Aesthetic interior and seriously good coffee. Get there early. #brunch #hydra #trending #cafe #aesthetic #algiers',
   '@dz.hype.spots', 'https://instagram.com/p/dz-reel-2', 'Hydra, Algiers', array['brunch','cafe','trending']),
  ('DZ', 'Epic day out with the crew. Karting first, then paintball, ended with a massive mixed grill. Intense energy all day, zero chill. #adventure #karting #paintball #intense #boys #grill #cheraga',
   '@adventure.dz', 'https://instagram.com/p/dz-reel-3', 'Cheraga, Algiers', array['adventure','intense','activity']),
  ('DZ', 'Best rooftop bar vibes in Algiers. Live music, city lights, great cocktails. The move for a night out. #nightlife #rooftop #algiers #drinks #livemusic',
   '@algiers.nights', 'https://instagram.com/p/dz-reel-4', 'Algiers Centre', array['nightlife','rooftop','drinks']),
  ('DZ', 'This tiny family run spot in the Casbah serves the most authentic couscous in the city. A must try. #authentic #casbah #food #couscous #hiddengem #algiers',
   '@hidden.algiers', 'https://instagram.com/p/dz-reel-5', 'Casbah, Algiers', array['food','authentic'])
) as v(market, body, handle, url, loc, tags);
