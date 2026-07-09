-- Google Places (New) ingestion: tag a venue's origin and whether its price is a
-- tier estimate. google_place_id (unique) and latitude/longitude already exist on
-- venues, so this only adds the two missing provenance columns. Idempotent.

alter table venues
  add column if not exists source text not null default 'manual',
  add column if not exists price_estimated boolean not null default false;

-- source check: only 'manual' (hand-entered / Instagram pipeline) or 'google'
-- (imported). Drop-then-add so the migration is re-runnable.
alter table venues drop constraint if exists venues_source_check;
alter table venues
  add constraint venues_source_check check (source in ('manual', 'google'));
