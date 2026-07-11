-- The Daily Pulse realtime: stream promoter changes (new / boosted / edited events)
-- to clients live. Add `events` to the Supabase realtime publication so the
-- useDailyPulse channel actually receives postgres_changes. Idempotent — a duplicate
-- add is swallowed. RLS still applies to realtime, so clients only get rows they can
-- already SELECT (the public feed already reads events directly, so this is safe).
do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;
