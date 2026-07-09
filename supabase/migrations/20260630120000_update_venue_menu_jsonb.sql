-- Menu OCR: let the venue edit form persist the structured menu (jsonb) and flip
-- price_estimated, so reading a real menu off a photo replaces the price_level
-- guess with observed prices.
--
-- Appends p_menu (jsonb) + p_price_estimated (boolean) to update_venue. Both
-- coalesce to the existing value so a normal edit that doesn't touch the menu
-- never wipes a scraped/OCR'd menu or resets the estimated flag.
drop function if exists public.update_venue(uuid, text, text, text[], text, text, text, text, text, text, text, boolean, numeric, text, numeric, integer, text, text, text[]);

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
      end
  where id = p_id;

  return p_id;
end;
$$;
