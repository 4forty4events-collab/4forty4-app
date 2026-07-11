-- Admin authoring for The 4Forty4 Drop. create_drop / delete_drop are SECURITY DEFINER
-- and re-check is_admin() server-side (the client admin gating is UX, not the boundary).
-- These are the only write path into premium_drops — the table's RLS stays read-only.

create or replace function public.create_drop(
  p_market text, p_title text, p_teaser text, p_venue_name text, p_category text,
  p_cover_image_url text, p_drop_at timestamptz, p_ends_at timestamptz, p_allocation int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_title is null or length(btrim(p_title)) = 0 then raise exception 'TITLE_REQUIRED'; end if;
  if p_drop_at is null then raise exception 'DROP_AT_REQUIRED'; end if;
  if coalesce(p_allocation, 44) <= 0 then raise exception 'BAD_ALLOCATION'; end if;

  insert into public.premium_drops
    (market, title, teaser, venue_name, category, cover_image_url, drop_at, ends_at, allocation)
  values
    (p_market, btrim(p_title),
     nullif(btrim(coalesce(p_teaser, '')), ''),
     nullif(btrim(coalesce(p_venue_name, '')), ''),
     nullif(btrim(coalesce(p_category, '')), ''),
     nullif(btrim(coalesce(p_cover_image_url, '')), ''),
     p_drop_at, p_ends_at, coalesce(p_allocation, 44))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_drop(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from public.premium_drops where id = p_id;  -- cascades to claims / waitlist
end $$;

grant execute on function public.create_drop(text, text, text, text, text, text, timestamptz, timestamptz, int) to authenticated;
grant execute on function public.delete_drop(uuid) to authenticated;
