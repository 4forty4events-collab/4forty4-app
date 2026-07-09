-- Manual itinerary control (Workstream 2). The itinerary is human-editable, not
-- only AI-curated: add-from-catalog, manual add/edit/reorder/delete, admin
-- delete-whole-plan, and date-based active/past split. Most manual CRUD rides the
-- existing RLS (trip_items "editor write" is FOR ALL -> insert/update/delete) and
-- the shared remove_trip_item RPC, so this migration only adds the admin plan-delete.

-- Admin: delete an ENTIRE plan (not just one stop). FK-safe -- mirror the venue-
-- delete pattern from the Curation Toolkit: clear child rows first, then the trip.
-- collaborative_trips' children are ON DELETE CASCADE already, so the explicit
-- deletes are belt-and-suspenders (and make the order auditable). is_admin() gated.
create or replace function public.admin_delete_trip(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  delete from public.trip_items        where trip_id = p_trip;
  delete from public.trip_messages     where trip_id = p_trip;
  delete from public.trip_participants where trip_id = p_trip;
  delete from public.collaborative_trips where id = p_trip;
end $$;

revoke execute on function public.admin_delete_trip(uuid) from public, anon;
grant  execute on function public.admin_delete_trip(uuid) to authenticated;
