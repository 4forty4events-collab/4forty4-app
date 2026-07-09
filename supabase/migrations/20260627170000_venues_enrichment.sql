-- Place-detail enrichment (Bright Data collect-by-URL on a venue's google_maps_url).
-- The high-value field is `menu`: structured dish/price data (DZD), not a photo.
alter table venues add column if not exists menu jsonb;            -- normalized [{section,name,description,price}]
alter table venues add column if not exists review_count integer;  -- Google review count
alter table venues add column if not exists hours jsonb;           -- opening hours, as returned
alter table venues add column if not exists google_maps_url text;  -- captured in discovery; input for enrichment
