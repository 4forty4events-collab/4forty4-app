-- Menu provenance flag on venues.
--   'scraped'        : Step-2 enrichment found a structured menu
--   'pending_manual' : menu-bearing venue with no scraped menu yet (manual backlog)
--   'manual'         : entered by hand
--   null             : not menu-relevant / not yet assessed
alter table venues add column if not exists menu_status text;
alter table venues drop constraint if exists venues_menu_status_check;
alter table venues add constraint venues_menu_status_check
  check (menu_status is null or menu_status in ('scraped', 'pending_manual', 'manual'));

-- ============================================================================
-- Grid harvester state (resumable background batch over a coordinate grid).
-- A "run" sweeps many "sectors". The orchestrator processes ONE sector step per
-- invocation so nothing times out, and progress survives across invocations --
-- this state is what makes a city sweep resumable, capped, and monitorable.
-- ============================================================================
create table if not exists harvest_runs (
  id uuid primary key default gen_random_uuid(),
  market text not null,
  status text not null default 'running'
    check (status in ('running', 'paused', 'capped', 'done', 'failed')),
  max_venues integer not null default 100,    -- HARD safety cap (operator-set)
  venues_ingested integer not null default 0, -- new venues counted toward the cap
  sectors_total integer not null default 0,
  sectors_done integer not null default 0,
  keyword text not null default 'restaurants',
  category text not null default 'restaurant', -- fallback tag for unclassified venues
  zoom_level integer not null default 14,
  enrich boolean not null default false,       -- Stage B switch (off in Stage A)
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists harvest_sectors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references harvest_runs(id) on delete cascade,
  idx integer not null,             -- sweep order
  neighborhood text,                -- area label -> stored as venue.city (drives pricing)
  lat double precision not null,
  long double precision not null,
  status text not null default 'pending'
    check (status in ('pending', 'scraping', 'done', 'failed')),
  snapshot_id text,                 -- Bright Data job id while a sector is scraping
  venues_found integer not null default 0,
  error text,
  updated_at timestamptz not null default now(),
  unique (run_id, idx)
);

create index if not exists idx_harvest_sectors_run on harvest_sectors(run_id, status);

-- Admin-only. The orchestrator writes with the service-role key (bypasses RLS);
-- these policies lock the tables down for any direct client access.
alter table harvest_runs enable row level security;
alter table harvest_sectors enable row level security;
drop policy if exists harvest_runs_admin on harvest_runs;
drop policy if exists harvest_sectors_admin on harvest_sectors;
create policy harvest_runs_admin on harvest_runs for all using (is_admin()) with check (is_admin());
create policy harvest_sectors_admin on harvest_sectors for all using (is_admin()) with check (is_admin());
