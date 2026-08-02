-- Trip fields (redesign follow-up): a real budget, per-stop clock times, and a
-- cancel status — so the Outings cards / detail can show a budget bar, a timeline
-- with times, and TONIGHT / CANCELLED badges without faking data.
--
-- APPLY VIA THE SUPABASE SQL EDITOR. Do NOT `db push` (history desynced). Idempotent.

alter table public.collaborative_trips add column if not exists budget   numeric;
alter table public.collaborative_trips add column if not exists currency text not null default 'DZD';
alter table public.collaborative_trips add column if not exists status   text not null default 'active'
  check (status in ('active', 'cancelled'));

alter table public.trip_items add column if not exists start_time text;  -- "HH:MM"; null = untimed

-- Owner-gated meta setters (mirror set_trip_public). start_time is written directly
-- through the existing trip_items editor RLS (updateTripItem) — no RPC needed.
create or replace function public.set_trip_budget(p_trip uuid, p_budget numeric, p_currency text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.collaborative_trips
     set budget = p_budget, currency = coalesce(nullif(p_currency, ''), currency)
   where id = p_trip and created_by = auth.uid();
end $$;
grant execute on function public.set_trip_budget(uuid, numeric, text) to authenticated;

create or replace function public.set_trip_status(p_trip uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('active', 'cancelled') then raise exception 'bad status'; end if;
  update public.collaborative_trips set status = p_status
   where id = p_trip and created_by = auth.uid();
end $$;
grant execute on function public.set_trip_status(uuid, text) to authenticated;
