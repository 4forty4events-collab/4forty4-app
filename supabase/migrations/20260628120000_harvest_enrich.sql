-- Stage B: in-sweep enrichment state.
-- harvest_runs already has `enrich boolean`. These track the enrichment phase:
alter table harvest_runs add column if not exists venues_enriched integer not null default 0;
alter table harvest_runs add column if not exists enrich_failed integer not null default 0;
alter table harvest_runs add column if not exists enrich_snapshot text;   -- in-flight Bright Data job
alter table harvest_runs add column if not exists enrich_place_id text;   -- venue being enriched now

-- Marks a venue the harvester has already attempted to enrich (success OR failure),
-- so a failed enrichment is never retried in a loop and future runs skip it. A
-- successful enrich also flips menu_status to 'scraped'; a failed one stays
-- 'pending_manual' (manual-entry backlog) but with this timestamp set.
alter table venues add column if not exists enrich_attempted_at timestamptz;
create index if not exists idx_venues_enrich_queue
  on venues (market, menu_status)
  where source = 'google_maps_scrape' and enrich_attempted_at is null;
