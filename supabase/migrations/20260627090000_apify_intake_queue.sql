-- Apify → intake queue. content_drafts IS the queue; these columns let a scraped
-- Instagram post land as a pending draft and stay dedup-safe across re-runs.
--   source           where the draft came from ('manual' = typed/parsed by hand,
--                    'instagram' = pulled by ingest-apify)
--   source_shortcode the IG post shortCode — the dedup key. A second ingest run
--                    that re-sees the same post is skipped on this.
--   image_url        the scraped IG CDN image, kept for PREVIEW ONLY in triage.
--                    IG CDN URLs expire, so the real cover is re-uploaded to R2
--                    at publish time — never this URL.
alter table content_drafts
  add column if not exists source text not null default 'manual',
  add column if not exists source_shortcode text,
  add column if not exists image_url text;

alter table content_drafts drop constraint if exists content_drafts_source_check;
alter table content_drafts
  add constraint content_drafts_source_check check (source in ('manual', 'instagram'));

-- Dedup key. Partial + unique: only scraped drafts carry a shortcode, and two
-- NULLs (manual drafts) must never collide. This is the non-negotiable guard
-- that stops the queue filling with repeats on every run.
create unique index if not exists content_drafts_source_shortcode_key
  on content_drafts (source_shortcode)
  where source_shortcode is not null;
