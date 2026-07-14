-- Upload quota ledger for r2-presign.
--
-- Presigning used to be admin-only, which meant no real user could post a moment photo or a
-- review photo. Opening it to any signed-in user needs a cap, or one account can fill the
-- bucket. Every successful presign writes a row here and the function counts the last hour
-- before signing the next one.
--
-- Written and read ONLY by the edge function via the service role: RLS is on with no
-- policies, so PostgREST clients (anon/authenticated) can never read or forge rows.

create table if not exists public.upload_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content_type text not null,
  bytes bigint,
  created_at timestamptz not null default now()
);

-- The only query this table serves: "how many uploads for this user since T".
create index if not exists upload_events_user_time_idx
  on public.upload_events (user_id, created_at desc);

alter table public.upload_events enable row level security;
