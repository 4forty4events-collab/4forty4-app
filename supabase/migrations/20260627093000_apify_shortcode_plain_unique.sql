-- The dedup index must be a PLAIN unique index, not partial: INSERT ... ON CONFLICT
-- (used by the ingest upsert) can't infer a partial index, so the upsert would fail
-- at runtime. A plain unique index on source_shortcode still allows unlimited NULLs
-- (Postgres treats NULLs as distinct), so manual drafts are unaffected and scraped
-- shortcodes stay unique. Same dedup guarantee, but ON CONFLICT can now use it.
drop index if exists content_drafts_source_shortcode_key;
create unique index if not exists content_drafts_source_shortcode_key
  on content_drafts (source_shortcode);
