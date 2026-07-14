-- ============================================================================
-- Notification pipeline schedules (Module 5) -- MANUAL RUN, NOT a migration.
-- ============================================================================
-- This file is intentionally OUTSIDE migrations/ so `supabase db push` never runs
-- it automatically (it contains placeholders that would fail). Run it ONCE by hand
-- in the Supabase SQL editor after you have:
--   1) applied 20260709160000_push_delivery.sql,
--   2) deployed the deliver-push + run-schedulers edge functions,
--   3) set the SCHEDULER_SECRET function secret.
--
-- Replace <PROJECT_REF> with your Supabase project ref and <SCHEDULER_SECRET> with
-- the same value you set via `supabase secrets set SCHEDULER_SECRET=...`. Prefer
-- storing the secret in Supabase Vault and reading it here rather than inlining it;
-- it is inlined below only for clarity. Do not commit a real secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- deliver-push: sweep undelivered notifications to devices every minute.
select cron.schedule(
  'deliver-push-every-min',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/deliver-push',
    headers := jsonb_build_object('content-type', 'application/json', 'x-scheduler-secret', '<SCHEDULER_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- run-schedulers: generate scheduled notifications (event reminders) every 15 min.
select cron.schedule(
  'run-schedulers-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-schedulers',
    headers := jsonb_build_object('content-type', 'application/json', 'x-scheduler-secret', '<SCHEDULER_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- To inspect or remove later:
--   select jobid, schedule, jobname from cron.job;
--   select cron.unschedule('deliver-push-every-min');
--   select cron.unschedule('run-schedulers-15min');
