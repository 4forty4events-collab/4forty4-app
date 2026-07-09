-- Save feature: lock saved_items to its owner and dedup per listing.
-- Stage 1 created the table with two nullable FK columns (venue_id / event_id,
-- exactly one set per row) rather than a polymorphic listing_id+kind, so the
-- constraints below are shaped to that.

alter table public.saved_items enable row level security;

-- saved_at should always stamp itself.
alter table public.saved_items alter column saved_at set default now();

-- A user sees and mutates only their own saves.
drop policy if exists "own saves select" on public.saved_items;
drop policy if exists "own saves insert" on public.saved_items;
drop policy if exists "own saves delete" on public.saved_items;

create policy "own saves select" on public.saved_items
  for select using (auth.uid() = user_id);
create policy "own saves insert" on public.saved_items
  for insert with check (auth.uid() = user_id);
create policy "own saves delete" on public.saved_items
  for delete using (auth.uid() = user_id);

-- Dedup: one save per user per listing. Two PARTIAL uniques, not one composite:
-- the shape is two nullable columns (one always null), and a plain composite
-- unique would let duplicates through because NULLs compare as distinct.
create unique index if not exists saved_items_user_venue_uniq
  on public.saved_items (user_id, venue_id) where venue_id is not null;
create unique index if not exists saved_items_user_event_uniq
  on public.saved_items (user_id, event_id) where event_id is not null;
