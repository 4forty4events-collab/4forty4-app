-- Auto-created "stub" venues are scaffolding: publish_event's match-or-create
-- spins one up so an event has something to link to, but it has no real
-- category/image/description and shouldn't appear as its own feed card.
-- is_stub is an EXPLICIT flag for that — NOT category='other', which is a
-- legitimate user choice and must not double as "auto-created".
alter table public.venues
  add column is_stub boolean not null default false;

-- Backfill the existing auto-created stubs. Tightly scoped so a real venue a
-- human deliberately filed under 'other' is never caught: must be category
-- 'other', have no image AND no description, AND be referenced by an event.
update public.venues v
set is_stub = true
where v.category = 'other'
  and v.cover_image_url is null
  and v.description is null
  and exists (select 1 from public.events e where e.venue_id = v.id);

-- Recreate publish_event so the not-found (auto-create) branch marks the new
-- venue as a stub. publish_venue inserts with the column default (false), so a
-- deliberately added venue is never a stub. Signature unchanged.
create or replace function public.publish_event(
  p_draft_id uuid,
  p_title text,
  p_category text,
  p_tags text[],
  p_description text,
  p_venue_name text,
  p_event_date date,
  p_event_time text,
  p_price numeric,
  p_price_note text,
  p_currency text,
  p_market text,
  p_cover_image_url text default null,
  p_contact_whatsapp text default null,
  p_contact_phone text default null,
  p_contact_instagram text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_venue_id uuid;
  v_venue_city text;
  v_event_id uuid;
  v_tz text;
  v_time time;
  v_start_time timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  v_norm := lower(regexp_replace(btrim(p_venue_name), '\s+', ' ', 'g'));

  select id, city into v_venue_id, v_venue_city
  from public.venues
  where lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = v_norm
    and market = p_market
  limit 1;

  if v_venue_id is null then
    insert into public.venues (name, market, category, tags, description, address, is_stub)
    values (p_venue_name, p_market, 'other', '{}', null, null, true)
    returning id, city into v_venue_id, v_venue_city;
  end if;

  v_tz := case p_market when 'DZ' then 'Africa/Algiers' else 'Africa/Harare' end;

  begin
    v_time := p_event_time::time;
  exception when others then
    v_time := null;
  end;

  if p_event_date is not null then
    v_start_time := (p_event_date + coalesce(v_time, time '00:00')) at time zone v_tz;
  end if;

  insert into public.events (
    venue_id, created_by, title, description, category, tags,
    start_time, price, price_note, currency, price_dzd, is_free,
    market, city, cover_image_url,
    contact_whatsapp, contact_phone, contact_instagram
  )
  values (
    v_venue_id, auth.uid(), p_title, p_description, p_category, coalesce(p_tags, '{}'),
    v_start_time, p_price, p_price_note, p_currency,
    case when p_currency = 'DZD' then p_price end,
    (p_price is null and 'free' = any(coalesce(p_tags, '{}'))),
    p_market, v_venue_city, p_cover_image_url,
    p_contact_whatsapp, p_contact_phone, p_contact_instagram
  )
  returning id into v_event_id;

  update public.content_drafts
  set status = 'published',
      published_event_id = v_event_id,
      published_venue_id = v_venue_id,
      updated_at = now()
  where id = p_draft_id;

  return v_event_id;
end;
$$;
