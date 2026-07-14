-- 4Forty4 Radar — Layer 1: eligibility + event time-gate.
--
-- Radar only ever spotlights high-end experiences (the "zero spam / no minor stalls"
-- promise). Rather than recompute that policy everywhere, we bake it into a STORED
-- generated column on venues so it's always in sync with the row and indexable.
--
-- Eligible venue = not a stub, in an experience category (NOT shopping/other "stalls"),
-- AND carrying at least one quality signal: an Editor's Pick, a crowd-verified rating,
-- or a curated "hidden gem" tag. (All same-row, immutable -> valid for a STORED column.)
alter table public.venues
  add column if not exists is_radar_eligible boolean
  generated always as (
    is_stub = false
    and category = any (array['restaurant','nightlife','hotel','tourism','culture','outdoor','wellness','sports','cafe'])
    and (
         is_featured = true
      or (rating >= 4.3 and coalesce(review_count, 0) >= 30)
      or tags @> array['hidden_gem']
    )
  ) stored;

-- Note: the proximity RPC filters `is_radar_eligible` on top of the existing GiST
-- spatial index (idx_venues_location). At a ~500m radius the candidate set is tiny,
-- so the boolean filter is effectively free; a dedicated partial index isn't needed
-- (and a generated column in an index predicate is a portability footgun we skip).

-- Event time-gate: proximity for an event only fires while it's ACTIVE or starting
-- within a tight lead window (default 2h). Events inherit their venue's coordinates,
-- so geo lives on the join; this function is purely the temporal guard. STABLE (now()).
create or replace function public.event_in_radar_window(
  p_start timestamptz,
  p_end   timestamptz,
  p_lead  interval default interval '2 hours'
)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_start is not null and (
    -- happening right now
    (now() >= p_start and (p_end is null or now() <= p_end))
    -- or about to start, within the lead window
    or (p_start > now() and p_start <= now() + p_lead)
  );
$$;

grant execute on function public.event_in_radar_window(timestamptz, timestamptz, interval) to anon, authenticated;
