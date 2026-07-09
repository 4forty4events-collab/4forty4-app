-- Backfill cleanup: remove venues that leaked in from OUTSIDE the target country.
-- Sparse activity keyword searches (karting/paintball/escape room/...) pulled
-- high-ranked FOREIGN Google Maps results (France, Spain, Egypt, Saudi Arabia,
-- USA, Panama, Qatar...) that Bright Data ranked above the thin local set; ingest
-- then stamped them with the local market by default, never checking that their
-- coordinates fall inside the country. The ingest geo-guard now blocks these at
-- the door (MARKET_BBOX + foreign-address fallback); this one-time pass removes the
-- ones already written.
--
-- FK-safe (mirrors delete_venue): dependent events are removed first so no
-- events.venue_id is orphaned by its ON DELETE SET NULL rule -- scraped venues have
-- no events, so this is belt-and-suspenders. saved_items/budget_items cascade with
-- the venue; content_drafts.published_venue_id SET NULLs harmlessly.
--
-- National bounding boxes (generous -- whole country, not the Algiers metro box):
--   DZ (Algeria):   lat 18.5 .. 37.5,  long -9.0 .. 12.5
--   ZW (Zimbabwe):  lat -22.7 .. -15.5, long 25.0 .. 33.2
do $$
declare
  v_count integer;
begin
  create temporary table _geo_bad on commit drop as
  select v.id
  from public.venues v
  where v.latitude is not null and v.longitude is not null and (
    (v.market = 'DZ' and (v.latitude < 18.5  or v.latitude > 37.5  or v.longitude < -9.0 or v.longitude > 12.5)) or
    (v.market = 'ZW' and (v.latitude < -22.7 or v.latitude > -15.5 or v.longitude < 25.0 or v.longitude > 33.2))
  );

  select count(*) into v_count from _geo_bad;

  delete from public.events  where venue_id in (select id from _geo_bad);
  delete from public.venues  where id       in (select id from _geo_bad);

  raise notice 'geo-backfill: removed % out-of-country venue(s)', v_count;
end $$;
