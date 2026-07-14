-- Customer orders for the TOZVINZWISISA store. Checkout writes here through the SECURITY
-- DEFINER place_merch_order RPC (works for guests — anon + authenticated). Admins read,
-- update (status / details), and delete via RLS gated on is_admin(). Item fields are
-- DENORMALIZED so an order survives later product edits/deletes. Still no payment gateway:
-- a row records the buyer's submitted intent; money moves manually via CCP / EcoCash.

create table if not exists public.merch_orders (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  kind              text not null default 'product' check (kind in ('product','tip')),
  item_name         text not null,
  size              text,
  amount_label      text,                 -- display string as shown at checkout ("3 200 DA")
  market            text,
  pay_method        text,                 -- 'CCP' | 'EcoCash' at order time
  customer_name     text not null,
  customer_phone    text not null,
  customer_address  text,                 -- null for tips
  image_url         text,                 -- cover thumbnail for the admin list
  status            text not null default 'new' check (status in ('new','paid','shipped','cancelled')),
  note              text,                 -- admin note
  updated_at        timestamptz not null default now()
);
create index if not exists merch_orders_feed_idx on public.merch_orders (status, created_at desc);

alter table public.merch_orders enable row level security;

-- Orders are PRIVATE: only admins can read / update / delete. No public select policy.
do $$ begin
  create policy merch_orders_admin_read on public.merch_orders for select using (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy merch_orders_admin_update on public.merch_orders for update using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy merch_orders_admin_delete on public.merch_orders for delete using (public.is_admin());
exception when duplicate_object then null; end $$;

-- Anyone (incl. guests) places an order via this validated RPC; the definer bypasses RLS
-- for the INSERT only. There is deliberately no client INSERT policy.
create or replace function public.place_merch_order(
  p_kind text, p_item_name text, p_size text, p_amount_label text,
  p_market text, p_pay_method text, p_name text, p_phone text,
  p_address text, p_image_url text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'NAME_REQUIRED'; end if;
  if p_phone is null or length(btrim(p_phone)) = 0 then raise exception 'PHONE_REQUIRED'; end if;
  insert into public.merch_orders
    (kind, item_name, size, amount_label, market, pay_method, customer_name, customer_phone, customer_address, image_url)
  values
    (coalesce(nullif(btrim(p_kind), ''), 'product'),
     btrim(coalesce(p_item_name, 'Order')),
     nullif(btrim(coalesce(p_size, '')), ''),
     nullif(btrim(coalesce(p_amount_label, '')), ''),
     nullif(btrim(coalesce(p_market, '')), ''),
     nullif(btrim(coalesce(p_pay_method, '')), ''),
     btrim(p_name), btrim(p_phone),
     nullif(btrim(coalesce(p_address, '')), ''),
     nullif(btrim(coalesce(p_image_url, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.place_merch_order(text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
