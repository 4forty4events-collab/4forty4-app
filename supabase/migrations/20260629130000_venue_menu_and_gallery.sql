-- Curation Toolkit: manual menu entry + gallery editing on venues.
--
-- Manual menu = a free-text paste and/or an external link (Instagram, a PDF,
-- etc.), distinct from the structured scraped `menu` jsonb. Gallery editing
-- reuses the existing image_urls text[] (cover_image_url stays = image_urls[0]).

alter table public.venues add column if not exists menu_text text;  -- hand-pasted menu body
alter table public.venues add column if not exists menu_url text;   -- external menu link

-- Recreate update_venue with menu + gallery threaded in. Drop the exact prior
-- signature first so PostgREST never sees an ambiguous overload.
drop function if exists public.update_venue(uuid, text, text, text[], text, text, text, text, text, text, text, boolean, numeric, text, numeric, integer);

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
  p_image_urls text[] default null
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
      -- Gallery is edited in-place; the client sends the cover as image_urls[0].
      -- coalesce guards any non-form caller that omits it (don't wipe a gallery).
      image_urls = coalesce(p_image_urls, image_urls),
      -- Flip to 'manual' when hand-entered menu content is present, but never
      -- clobber a 'scraped' status; otherwise leave the status as-is.
      menu_status = case
        when (p_menu_text is not null or p_menu_url is not null)
             and menu_status is distinct from 'scraped'
          then 'manual'
        else menu_status
      end
  where id = p_id;

  return p_id;
end;
$$;
