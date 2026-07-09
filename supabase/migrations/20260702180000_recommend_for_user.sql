-- Discovery Slice 5: personalized "For You" recommendations from interaction data.
-- Derives category preferences from the caller's own interactions (weighted
-- plan_add > save > view), then ranks venues in those categories by
-- preference x quality (rating x ln(reviews)), EXCLUDING places they've already
-- engaged with. Cold-start (no interactions) degrades gracefully to trending, so
-- the shelf always returns something sensible. Uses auth.uid() — a user can only
-- ever get their OWN recommendations.
create or replace function public.recommend_for_user(
  p_market text,
  p_cursor jsonb default null,
  p_limit integer default 12
)
returns table (kind text, item jsonb, distance_m double precision, sort_v double precision, out_id uuid)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid       uuid := auth.uid();
  v_limit     integer := least(greatest(coalesce(p_limit, 12), 1), 50);
  v_cur_v     double precision := case when p_cursor ? 'v'  then (p_cursor->>'v')::double precision end;
  v_cur_id    uuid             := case when p_cursor ? 'id' then (p_cursor->>'id')::uuid end;
  v_has_prefs boolean;
begin
  select exists (
    select 1 from public.interactions i
    join public.venues v on v.id = i.venue_id
    where i.user_id = v_uid and i.market = p_market and v.category is not null
  ) into v_has_prefs;

  return query
  with prefs as (
    select v.category as category,
           sum(case i.type when 'plan_add' then 3 when 'save' then 2 else 1 end)::double precision as w
    from public.interactions i
    join public.venues v on v.id = i.venue_id
    where i.user_id = v_uid and i.market = p_market and v.category is not null
    group by v.category
  ),
  cand as (
    select v.id,
           to_jsonb(v.*) as item,
           coalesce((select w from prefs p where p.category = v.category), 0) as pref_w,
           coalesce(v.rating, 0)::double precision * ln(coalesce(v.review_count, 0) + 1) as quality
    from public.venues v
    where v.market = p_market
      and v.is_stub = false
      -- never recommend what they've already engaged with
      and (v_uid is null
           or v.id not in (select venue_id from public.interactions
                           where user_id = v_uid and venue_id is not null))
      -- with prefs: only their preferred categories; cold-start: everything
      and (not v_has_prefs or v.category in (select category from prefs))
  ),
  scored as (
    select c.item, c.id,
      case when v_has_prefs
        then round(c.pref_w * (c.quality + 1) * 100)
        else round(c.quality * 1000)
      end::double precision as sort_v
    from cand c
  )
  select 'venue'::text, s.item, null::double precision, s.sort_v, s.id
  from scored s
  where p_cursor is null
     or (s.sort_v < v_cur_v or (s.sort_v = v_cur_v and s.id < v_cur_id))
  order by s.sort_v desc, s.id desc
  limit v_limit;
end $$;

grant execute on function public.recommend_for_user(text, jsonb, integer) to anon, authenticated;
