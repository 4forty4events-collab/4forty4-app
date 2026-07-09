-- Activities harvest: flag venues whose Google type was unmappable/ambiguous so
-- an admin can categorize them, instead of the harvester guessing (which is how
-- junk slipped in). Real venues, just uncertain category -- distinct from is_stub
-- (a placeholder shell). Defaults false so nothing existing changes.
alter table public.venues
  add column if not exists needs_review boolean not null default false;

create index if not exists idx_venues_needs_review
  on public.venues (market) where needs_review = true;
