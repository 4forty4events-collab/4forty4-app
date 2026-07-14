-- Merch v2: per-size stock + a Discover promotion flag. `sizes` is a jsonb array of
-- {"size":"M","soldOut":false} in display order; `promoted` surfaces the product as an
-- ad card on the Discover page (admin toggles it in the Merch Manager). Additive +
-- idempotent — safe to re-run. Re-run of the base 20260711160000 migration is NOT needed.

alter table public.merch_products add column if not exists sizes jsonb not null default '[]'::jsonb;
alter table public.merch_products add column if not exists promoted boolean not null default false;
create index if not exists merch_products_promoted_idx on public.merch_products (promoted) where promoted;

-- Recreate upsert_merch_product with the two new trailing params. Drop the previous
-- 12-arg version so PostgREST resolves to exactly one overload.
drop function if exists public.upsert_merch_product(uuid, text, text, text, text, int, int, jsonb, text, boolean, boolean, int);

create or replace function public.upsert_merch_product(
  p_id uuid, p_name text, p_category text, p_kind text, p_fabric text,
  p_price_dzd int, p_price_usd int, p_images jsonb, p_theme text,
  p_featured boolean, p_active boolean, p_sort_order int,
  p_sizes jsonb, p_promoted boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'NAME_REQUIRED'; end if;
  if coalesce(p_theme, 'ember') not in ('ember','sea','gold') then raise exception 'BAD_THEME'; end if;

  if p_id is null then
    insert into public.merch_products
      (name, category, kind, fabric, price_dzd, price_usd, images, theme, featured, active, sort_order, sizes, promoted)
    values
      (btrim(p_name),
       nullif(btrim(coalesce(p_category, '')), ''),
       nullif(btrim(coalesce(p_kind, '')), ''),
       nullif(btrim(coalesce(p_fabric, '')), ''),
       greatest(coalesce(p_price_dzd, 0), 0),
       greatest(coalesce(p_price_usd, 0), 0),
       coalesce(p_images, '[]'::jsonb),
       coalesce(p_theme, 'ember'),
       coalesce(p_featured, false),
       coalesce(p_active, true),
       coalesce(p_sort_order, 0),
       coalesce(p_sizes, '[]'::jsonb),
       coalesce(p_promoted, false))
    returning id into v_id;
  else
    update public.merch_products set
      name       = btrim(p_name),
      category   = nullif(btrim(coalesce(p_category, '')), ''),
      kind       = nullif(btrim(coalesce(p_kind, '')), ''),
      fabric     = nullif(btrim(coalesce(p_fabric, '')), ''),
      price_dzd  = greatest(coalesce(p_price_dzd, 0), 0),
      price_usd  = greatest(coalesce(p_price_usd, 0), 0),
      images     = coalesce(p_images, '[]'::jsonb),
      theme      = coalesce(p_theme, 'ember'),
      featured   = coalesce(p_featured, false),
      active     = coalesce(p_active, true),
      sort_order = coalesce(p_sort_order, 0),
      sizes      = coalesce(p_sizes, '[]'::jsonb),
      promoted   = coalesce(p_promoted, false)
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND'; end if;
  end if;
  return v_id;
end $$;

grant execute on function public.upsert_merch_product(uuid, text, text, text, text, int, int, jsonb, text, boolean, boolean, int, jsonb, boolean) to authenticated;
