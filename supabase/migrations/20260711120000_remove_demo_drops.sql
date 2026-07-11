-- Remove the demo seed drops used to build & verify The 4Forty4 Drop (from
-- 20260710160000 + 20260710180000). Cascades to their drop_claims / drop_waitlist.
-- Deleted by exact title so any real drop added later is never touched; idempotent.
delete from public.premium_drops
where title in (
  'Rooftop Secret Set — Algiers',
  'Midnight Courtyard — Algiers',
  'Warehouse After-Dark — Harare',
  'Lakeside Sessions — Harare'
);
