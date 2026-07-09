-- Safe author attribution for community content. profiles is owner-private (it
-- holds email + preferences), so we expose ONLY display fields via a view. A
-- plain (definer) view runs with the owner's rights, bypassing profiles RLS but
-- surfacing just id/name/avatar — so reviews and answers can show who wrote them
-- without leaking anything else.
create or replace view public.public_profiles as
  select id, full_name, avatar_url from public.profiles;

grant select on public.public_profiles to anon, authenticated;
