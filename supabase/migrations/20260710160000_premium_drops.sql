-- The 4Forty4 Drop — a limited-edition, single-item "sneaker-drop" claim that lives as
-- the most-anticipated hero of The Daily Pulse. A drop moves through three lifecycles:
--   teaser  -> live (at drop_at) -> sold_out (44 claimed) | ended (past ends_at)
-- claimed_count / status stream over realtime so every viewer's allocation meter tracks
-- the same live truth. All writes go through SECURITY DEFINER RPCs — the server clock and
-- the 44-cap are the authority, never the client.

create table if not exists public.premium_drops (
  id            uuid primary key default gen_random_uuid(),
  market        text not null,
  title         text not null,
  teaser        text,                 -- the veiled one-liner shown before the drop opens
  venue_name    text,
  category      text,
  cover_image_url text,
  drop_at       timestamptz not null,                 -- countdown target; opens at/after this
  ends_at       timestamptz,                          -- hard close
  allocation    int not null default 44 check (allocation > 0),
  claimed_count int not null default 0 check (claimed_count >= 0),
  status        text not null default 'teaser' check (status in ('teaser','live','sold_out','ended')),
  sold_out_at   timestamptz,                          -- stamped when the 44th is claimed
  created_at    timestamptz not null default now()
);
create index if not exists premium_drops_market_idx on public.premium_drops (market, drop_at desc);

create table if not exists public.drop_claims (
  id         uuid primary key default gen_random_uuid(),
  drop_id    uuid not null references public.premium_drops(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (drop_id, user_id)             -- one claim per user; a repeat tap is idempotent
);
create index if not exists drop_claims_drop_idx on public.drop_claims (drop_id, created_at);

create table if not exists public.drop_waitlist (
  id         uuid primary key default gen_random_uuid(),
  drop_id    uuid not null references public.premium_drops(id) on delete cascade,
  phone      text not null,
  created_at timestamptz not null default now()
);

alter table public.premium_drops enable row level security;
alter table public.drop_claims   enable row level security;
alter table public.drop_waitlist enable row level security;

-- Drops are public to read (the feed reads them directly; realtime honors this).
do $$ begin
  create policy premium_drops_read on public.premium_drops for select using (true);
exception when duplicate_object then null; end $$;

-- A user can see only their own claims. Claim/waitlist inserts happen through the RPCs
-- (SECURITY DEFINER), so there is deliberately no client INSERT policy.
do $$ begin
  create policy drop_claims_own on public.drop_claims for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ── claim_drop: the atomic velvet-rope. Row-locks the drop, re-checks the server clock
-- and the 44-cap, records the claim (idempotent per user), advances the counter, and flips
-- status to sold_out (stamping sold_out_at) the instant the last spot goes.
create or replace function public.claim_drop(p_drop_id uuid)
returns table (claimed_count int, allocation int, status text, "position" int)
language plpgsql security definer set search_path = public as $$
declare
  d     public.premium_drops;
  v_uid uuid := auth.uid();
  v_pos int;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into d from public.premium_drops where id = p_drop_id for update;
  if not found then raise exception 'DROP_NOT_FOUND'; end if;

  if now() < d.drop_at then raise exception 'DROP_NOT_LIVE'; end if;                 -- too early
  if d.ends_at is not null and now() > d.ends_at then raise exception 'DROP_ENDED'; end if;
  if d.status in ('sold_out','ended') or d.claimed_count >= d.allocation then
    raise exception 'DROP_SOLD_OUT';
  end if;

  -- Idempotent: a repeat tap returns the user's existing position without double-counting.
  begin
    insert into public.drop_claims (drop_id, user_id) values (p_drop_id, v_uid);
  exception when unique_violation then
    select count(*) into v_pos from public.drop_claims c
      where c.drop_id = p_drop_id
        and c.created_at <= (select created_at from public.drop_claims
                             where drop_id = p_drop_id and user_id = v_uid);
    return query select d.claimed_count, d.allocation, d.status, v_pos;
    return;
  end;

  update public.premium_drops
     set claimed_count = claimed_count + 1,
         status = case when claimed_count + 1 >= allocation then 'sold_out'
                       when status = 'teaser'               then 'live'
                       else status end,
         sold_out_at = case when claimed_count + 1 >= allocation and sold_out_at is null
                            then now() else sold_out_at end
   where id = p_drop_id
   returning claimed_count, status into d.claimed_count, d.status;

  return query select d.claimed_count, d.allocation, d.status, d.claimed_count;
end $$;

-- ── join_drop_waitlist: the aftermath priority SMS list.
create or replace function public.join_drop_waitlist(p_drop_id uuid, p_phone text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_phone is null or length(btrim(p_phone)) < 6 then raise exception 'INVALID_PHONE'; end if;
  insert into public.drop_waitlist (drop_id, phone) values (p_drop_id, btrim(p_phone));
end $$;

grant execute on function public.claim_drop(uuid)             to authenticated;
grant execute on function public.join_drop_waitlist(uuid, text) to anon, authenticated;

-- Stream claimed_count / status changes live to every viewer's meter. Idempotent.
do $$ begin
  alter publication supabase_realtime add table public.premium_drops;
exception when duplicate_object then null; end $$;

-- ── Seed one live-soon demo drop per market so the hero is testable end-to-end.
-- drop_at is ~90s out (watch teaser -> live); it stays open for 30 days.
insert into public.premium_drops (market, title, teaser, venue_name, category, cover_image_url, drop_at, ends_at)
select 'DZ', 'Rooftop Secret Set — Algiers', 'A hidden rooftop. One night. 44 spots.',
       'Undisclosed · Algiers', 'nightlife',
       'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200',
       now() + interval '90 seconds', now() + interval '30 days'
where not exists (select 1 from public.premium_drops where market = 'DZ');

insert into public.premium_drops (market, title, teaser, venue_name, category, cover_image_url, drop_at, ends_at)
select 'ZW', 'Warehouse After-Dark — Harare', 'Coordinates drop at zero. 44 spots.',
       'Undisclosed · Harare', 'nightlife',
       'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200',
       now() + interval '90 seconds', now() + interval '30 days'
where not exists (select 1 from public.premium_drops where market = 'ZW');
