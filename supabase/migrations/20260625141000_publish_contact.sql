-- Thread contact fields through publish. Adding params changes the signature,
-- so drop the prior overloads first to avoid PostgREST ambiguity.
drop function if exists public.publish_venue(uuid, text, text, text[], text, text, text, text);
drop function if exists public.publish_event(uuid, text, text, text[], text, text, date, text, numeric, text, text, text, text);

create or replace function public.publish_venue(
  p_draft_id uuid,
  p_title text,
  p_category text,
  p_tags text[],
  p_description text,
  p_address text,
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
  v_venue_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  insert into public.venues (
    name, category, tags, description, address, market, cover_image_url,
    contact_whatsapp, contact_phone, contact_instagram
  )
  values (
    p_title, p_category, coalesce(p_tags, '{}'), p_description, p_address, p_market, p_cover_image_url,
    p_contact_whatsapp, p_contact_phone, p_contact_instagram
  )
  returning id into v_venue_id;

  update public.content_drafts
  set status = 'published',
      published_venue_id = v_venue_id,
      updated_at = now()
  where id = p_draft_id;

  return v_venue_id;
end;
$$;

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
    insert into public.venues (name, market, category, tags, description, address)
    values (p_venue_name, p_market, 'other', '{}', null, null)
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
