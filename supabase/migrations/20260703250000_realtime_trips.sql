-- Realtime for the trip room: stream trip_messages + trip_items to participants.
-- REPLICA IDENTITY FULL so DELETE events include trip_id (the client filters
-- postgres_changes by trip_id, and default replica identity only ships the PK on
-- delete). RLS still governs what each subscriber may actually receive.
alter table public.trip_messages replica identity full;
alter table public.trip_items replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.trip_messages;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.trip_items;
  exception when duplicate_object then null; end;
end $$;
