-- Saved 2.0 + Collections.
--
-- (1) Split saved intent: every save is either a 'favorite' (loved / been) or a
--     'wishlist' (want to go), and can be 'pinned' to the top. Backfills as favorite
--     so existing saves are untouched. Adds the UPDATE policy the split needs (the
--     table previously had only select/insert/delete).
alter table public.saved_items
  add column if not exists list_type text not null default 'favorite'
    check (list_type in ('favorite', 'wishlist')),
  add column if not exists pinned boolean not null default false;

drop policy if exists "own saves update" on public.saved_items;
create policy "own saves update" on public.saved_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- (2) Named personal collections ("Date night", "Weekend in Algiers", ...).
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  emoji text,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists collections_user_idx
  on public.collections (user_id, is_pinned desc, created_at desc);

alter table public.collections enable row level security;
drop policy if exists "own collections" on public.collections;
create policy "own collections" on public.collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- (3) Collection membership. Same two-nullable-FK shape as saved_items: exactly one
--     of venue_id / event_id is set per row. Partial uniques dedup per collection.
create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  added_at timestamptz not null default now(),
  check ((venue_id is not null) <> (event_id is not null))
);
create unique index if not exists collection_items_venue_uniq
  on public.collection_items (collection_id, venue_id) where venue_id is not null;
create unique index if not exists collection_items_event_uniq
  on public.collection_items (collection_id, event_id) where event_id is not null;
create index if not exists collection_items_collection_idx
  on public.collection_items (collection_id, added_at desc);

alter table public.collection_items enable row level security;
-- Membership access is gated by ownership of the parent collection.
drop policy if exists "own collection items" on public.collection_items;
create policy "own collection items" on public.collection_items
  for all using (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
  );
