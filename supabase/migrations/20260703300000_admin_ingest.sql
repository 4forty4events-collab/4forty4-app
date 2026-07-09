-- Admin-facing wrapper for the backend-only ingest_external_itinerary. Lets an
-- admin paste a Reel from the app: is_admin() gated, but runs as owner so it can
-- call the client-revoked core ingest function.
create or replace function public.admin_ingest_external_itinerary(
  p_market text,
  p_body text,
  p_handle text default null,
  p_url text default null,
  p_location_text text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.'; end if;
  return public.ingest_external_itinerary(
    p_market, p_body, 'instagram',
    nullif(btrim(p_handle), ''), nullif(btrim(p_url), ''), nullif(btrim(p_location_text), ''),
    null, null);
end $$;
grant execute on function public.admin_ingest_external_itinerary(text, text, text, text, text) to authenticated;
