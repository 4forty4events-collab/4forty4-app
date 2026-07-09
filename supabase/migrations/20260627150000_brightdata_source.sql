-- Bright Data Google Maps scrape is a new venue provenance. Extend the source
-- check to allow it alongside 'manual' and 'google' (the dormant Places API path).
-- Venues from this source are real places but their price is tier-estimated, so
-- ingest sets price_estimated = true.
alter table venues drop constraint if exists venues_source_check;
alter table venues
  add constraint venues_source_check
  check (source in ('manual', 'google', 'google_maps_scrape'));
