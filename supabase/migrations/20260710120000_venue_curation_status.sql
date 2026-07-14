-- Curation review-status tracker for venues.
--
-- The Inbox/Manage curation phase tracks the ACTION of reviewing, not whether the
-- data is perfect: a place may lack info or photos and still be "done" once an admin
-- has looked at it and moved on. We record that with last_curated_at:
--   * NULL      -> pending curation (never reviewed) -> shows in the default queue
--   * timestamp -> reviewed (dropped from the pending queue)
--
-- Deliberately NOT backfilled: every existing venue stays NULL (pending), so the
-- admin does a full review pass over the current catalog. New imports insert with it
-- NULL too (the column just defaults), so they surface in the queue automatically.
alter table public.venues
  add column if not exists last_curated_at timestamptz;

-- Fast default-queue lookup: the pending set per market, newest first.
create index if not exists idx_venues_pending_curation
  on public.venues (market, created_at desc) where last_curated_at is null;

-- Any Save through the edit form counts as a review: stamp last_curated_at and clear
-- the harvester's needs_review hint (an admin has now addressed it). Same signature as
-- 20260630120000 (menu jsonb + price_estimated) -- only the SET clause changes.
create or replace function public.update_venue(
  p_id uuid,
  p_title text,
  p_category text,
  p_tags text[],
  p_description text,
  p_address text,
  p_market text,
  p_cover_image_url text,
  p_contact_whatsapp text,
  p_contact_phone text,
  p_contact_instagram text,
  p_is_stub boolean,
  p_price_per_person numeric default null,
  p_price_type text default null,
  p_price_max numeric default null,
  p_duration_days integer default 1,
  p_menu_text text default null,
  p_menu_url text default null,
  p_image_urls text[] default null,
  p_menu jsonb default null,
  p_price_estimated boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  update public.venues
  set name = p_title,
      category = p_category,
      tags = coalesce(p_tags, '{}'),
      description = p_description,
      address = p_address,
      market = p_market,
      cover_image_url = p_cover_image_url,
      contact_whatsapp = p_contact_whatsapp,
      contact_phone = p_contact_phone,
      contact_instagram = p_contact_instagram,
      is_stub = coalesce(p_is_stub, false),
      price_per_person = p_price_per_person,
      price_type = p_price_type,
      price_max = p_price_max,
      duration_days = coalesce(p_duration_days, 1),
      menu_text = p_menu_text,
      menu_url = p_menu_url,
      image_urls = coalesce(p_image_urls, image_urls),
      -- OCR menu: don't wipe an existing menu when the edit didn't touch it.
      menu = coalesce(p_menu, menu),
      price_estimated = coalesce(p_price_estimated, price_estimated),
      menu_status = case
        when (p_menu_text is not null or p_menu_url is not null or p_menu is not null)
             and menu_status is distinct from 'scraped'
          then 'manual'
        else menu_status
      end,
      -- Reviewing the listing (any save) marks it curated and resolves the hint.
      last_curated_at = now(),
      needs_review = false
  where id = p_id;

  return p_id;
end;
$$;

-- Explicit Skip / Reopen for the curation queue. Skip (p_curated = true) stamps a
-- listing reviewed without any edit -- for places with no info to change. Reopen
-- (p_curated = false) clears it back to pending so a skipped listing can be revisited.
create or replace function public.set_venue_curated(p_id uuid, p_curated boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  update public.venues
  set last_curated_at = case when p_curated then now() else null end,
      needs_review = case when p_curated then false else needs_review end
  where id = p_id;
end;
$$;

grant execute on function public.set_venue_curated(uuid, boolean) to authenticated;
