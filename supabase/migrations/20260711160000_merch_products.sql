-- TOZVINZWISISA merch catalog — the storefront that funds the platform. Products are
-- public to READ (the Merch lookbook reads them directly); the ONLY write path is the
-- admin-gated SECURITY DEFINER RPCs below, so RLS on the table stays read-only. This
-- backs the in-app Merch Manager; the static catalog.js list remains the offline/empty
-- fallback. No payment/order data lives here — checkout is manual (CCP / EcoCash).

create table if not exists public.merch_products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,                      -- small tag: TEE / HOODIE / HEADWEAR
  kind        text,                      -- badge: CAPSULE / FLAGSHIP DROP
  fabric      text,                      -- the spec line under the name
  price_dzd   int not null default 0 check (price_dzd >= 0),   -- shown as DA in Algeria
  price_usd   int not null default 0 check (price_usd >= 0),   -- shown as US$ in Zimbabwe
  images      jsonb not null default '[]'::jsonb,  -- gallery URLs; images[0] is the cover (else gradient art)
  theme       text not null default 'ember' check (theme in ('ember','sea','gold')),
  featured    boolean not null default false,   -- taller card + strong halo (the drop)
  active      boolean not null default true,    -- soft-hide without deleting
  sort_order  int not null default 0,           -- ascending; lower shows first
  created_at  timestamptz not null default now()
);
create index if not exists merch_products_live_idx
  on public.merch_products (active, featured desc, sort_order asc);

-- Reconcile installs applied BEFORE the multi-image change (single `image_url` text, no
-- `images`). `create table if not exists` above won't alter an existing table, so bring an
-- older table up to the current shape here. No-op on a fresh install.
alter table public.merch_products add column if not exists images jsonb not null default '[]'::jsonb;
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'merch_products' and column_name = 'image_url') then
    update public.merch_products
       set images = jsonb_build_array(image_url)
     where coalesce(image_url, '') <> '' and images = '[]'::jsonb;
    alter table public.merch_products drop column image_url;
  end if;
end $$;

alter table public.merch_products enable row level security;

-- Public read (the lookbook renders these directly). No client write policy — writes
-- go exclusively through the RPCs below.
do $$ begin
  create policy merch_products_read on public.merch_products for select using (true);
exception when duplicate_object then null; end $$;

-- Drop the pre-gallery overload (image_url text at arg 8) so only the jsonb version below
-- remains — two overloads would make PostgREST ambiguous. No-op if never created.
drop function if exists public.upsert_merch_product(uuid, text, text, text, text, int, int, text, text, boolean, boolean, int);

-- ── upsert_merch_product: create (p_id null) or edit (p_id set). Admin-only; the client
-- gating is UX, this is the boundary. Empty optional text collapses to null.
create or replace function public.upsert_merch_product(
  p_id uuid, p_name text, p_category text, p_kind text, p_fabric text,
  p_price_dzd int, p_price_usd int, p_images jsonb, p_theme text,
  p_featured boolean, p_active boolean, p_sort_order int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'NAME_REQUIRED'; end if;
  if coalesce(p_theme, 'ember') not in ('ember','sea','gold') then raise exception 'BAD_THEME'; end if;

  if p_id is null then
    insert into public.merch_products
      (name, category, kind, fabric, price_dzd, price_usd, images, theme, featured, active, sort_order)
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
       coalesce(p_sort_order, 0))
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
      sort_order = coalesce(p_sort_order, 0)
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.delete_merch_product(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from public.merch_products where id = p_id;
end $$;

grant execute on function public.upsert_merch_product(uuid, text, text, text, text, int, int, jsonb, text, boolean, boolean, int) to authenticated;
grant execute on function public.delete_merch_product(uuid) to authenticated;

-- ── Payment destinations (CCP / EcoCash), admin-editable from the Merch Manager. Public
-- to READ — checkout must display them to buyers to be paid; NOT secret, by design. The
-- only write path is the admin-gated RPC below. `catalog.js` PAYMENT stays the fallback
-- when a method has no row yet. `lines` mirrors the catalog shape: [[label, value], …].
create table if not exists public.merch_payment (
  method     text primary key check (method in ('CCP','EcoCash')),
  lines      jsonb not null default '[]'::jsonb,
  note       text,
  updated_at timestamptz not null default now()
);

alter table public.merch_payment enable row level security;
do $$ begin
  create policy merch_payment_read on public.merch_payment for select using (true);
exception when duplicate_object then null; end $$;

create or replace function public.upsert_merch_payment(p_method text, p_lines jsonb, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if coalesce(p_method, '') not in ('CCP','EcoCash') then raise exception 'BAD_METHOD'; end if;
  insert into public.merch_payment (method, lines, note, updated_at)
  values (p_method, coalesce(p_lines, '[]'::jsonb), nullif(btrim(coalesce(p_note, '')), ''), now())
  on conflict (method) do update
    set lines = excluded.lines, note = excluded.note, updated_at = now();
end $$;

grant execute on function public.upsert_merch_payment(text, jsonb, text) to authenticated;
