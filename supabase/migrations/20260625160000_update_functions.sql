-- Edit path: gated SECURITY DEFINER updates, mirroring the publish_* write path
-- so the client never writes tables directly. Admin-only.

-- update_venue also takes p_is_stub, so promoting a fleshed-out stub into the
-- feed (is_stub -> false) is a deliberate, explicit save.
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
  p_is_stub boolean
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
      is_stub = coalesce(p_is_stub, false)
  where id = p_id;

  return p_id;
end;
$$;

-- update_event mirrors publish_event's venue match-or-create + start_time
-- recompute (so editing the venue name re-links and editing date/time recomputes
-- the timestamp), but UPDATEs the existing event instead of inserting, and
-- leaves content_drafts untouched.
create or replace function public.update_event(
  p_id uuid,
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
  p_cover_image_url text,
  p_contact_whatsapp text,
  p_contact_phone text,
  p_contact_instagram text
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

  update public.events
  set venue_id = v_venue_id,
      title = p_title,
      description = p_description,
      category = p_category,
      tags = coalesce(p_tags, '{}'),
      start_time = v_start_time,
      price = p_price,
      price_note = p_price_note,
      currency = p_currency,
      price_dzd = case when p_currency = 'DZD' then p_price end,
      is_free = (p_price is null and 'free' = any(coalesce(p_tags, '{}'))),
      market = p_market,
      city = v_venue_city,
      cover_image_url = p_cover_image_url,
      contact_whatsapp = p_contact_whatsapp,
      contact_phone = p_contact_phone,
      contact_instagram = p_contact_instagram
  where id = p_id;

  return p_id;
end;
$$;

-- Consistency policies: SECURITY DEFINER functions bypass RLS, but add explicit
-- admin update policies so the model is coherent and any future direct update
-- is covered.
create policy "admins update venues" on public.venues
  for update using (public.is_admin()) with check (public.is_admin());

create policy "admins update events" on public.events
  for update using (public.is_admin()) with check (public.is_admin());
