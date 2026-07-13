-- Search matching fix: short keywords must find long / compound-word names.
--
-- Problem: the text filter used ONLY the trigram `%` operator, whose similarity is
-- normalised over the UNION of both strings' trigrams. So a short query against a
-- long name scores near-zero: similarity('karting algeria megakart cheraga', 'kart')
-- ~ 0.05, far below the 0.3 threshold -> the venue was unfindable unless you pasted
-- the whole name. It also can't reach a substring INSIDE a compound word ("kart"
-- inside "Megakart"). "Cheraga" failed the same way (diluted by the long name).
--
-- Fix, applied to BOTH venues (name/description) and events (title):
--   (1) WHERE now also matches a literal SUBSTRING via LIKE '%term%' (LIKE-special
--       chars in the query are escaped -> v_like), so "kart"/"karting"/"cheraga"/
--       "megakart" all hit, compound words included. Trigram `%` stays for typo
--       tolerance.
--   (2) relevance `sim` rewards exact/prefix/substring hits (1.0 / 0.97 / 0.9) and
--       adds word_similarity (best match of the query against any word-extent of the
--       name), so a genuine match bubbles to the top instead of scoring ~0.05.
--
-- Supersedes discover_hidden_gems (keeps its image-first bias + gems sort verbatim).
create or replace function public.discover(
  p_market text,
  p_categories text[] default null,
  p_text text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_m double precision default null,
  p_kinds text[] default null,
  p_sort text default 'recent',
  p_cursor jsonb default null,
  p_limit integer default 20,
  p_starts_before timestamptz default null,
  p_featured boolean default false
)
returns table (kind text, item jsonb, distance_m double precision, sort_v double precision, out_id uuid)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_point  geography := case when p_lat is not null and p_lng is not null
                          then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end;
  v_asc    boolean := (p_sort = 'distance');
  v_limit  integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_norm   text := case when p_text is not null and length(btrim(p_text)) > 0
                     then public.f_unaccent(lower(btrim(p_text))) end;
  -- LIKE-safe copy of the query: escape \ % _ so a literal '%' in a search term
  -- can't act as a wildcard. Paired with `escape '\'` on every LIKE below.
  v_like   text := case when v_norm is not null
                     then replace(replace(replace(v_norm, '\', '\\'), '%', '\%'), '_', '\_') end;
  v_cur_v  double precision := case when p_cursor ? 'v'  then (p_cursor->>'v')::double precision end;
  v_cur_id uuid             := case when p_cursor ? 'id' then (p_cursor->>'id')::uuid end;
begin
  return query
  with cand as (
    select 'venue'::text as kind, v.id, to_jsonb(v.*) as item,
           case when v_point is not null and v.location is not null
             then st_distance(v.location, v_point) end as dist,
           v.created_at, v.rating::double precision as rating, v.review_count,
           (nullif(btrim(v.cover_image_url), '') is not null) as has_cover,
           case when v_norm is not null then greatest(
             case when public.f_unaccent(lower(v.name)) = v_norm then 1.0
                  when public.f_unaccent(lower(v.name)) like v_like || '%' escape '\' then 0.97
                  when public.f_unaccent(lower(v.name)) like '%' || v_like || '%' escape '\' then 0.9
                  else 0 end,
             word_similarity(v_norm, public.f_unaccent(lower(v.name))),
             similarity(public.f_unaccent(lower(v.name)), v_norm),
             case when public.f_unaccent(lower(coalesce(v.description, ''))) like '%' || v_like || '%' escape '\' then 0.55 else 0 end,
             similarity(public.f_unaccent(lower(coalesce(v.description, ''))), v_norm)) end as sim
    from public.venues v
    where v.market = p_market
      and v.is_stub = false
      and (not p_featured or v.is_featured)
      and (p_kinds is null or 'venue' = any(p_kinds))
      and (p_categories is null or v.category = any(p_categories))
      and (v_point is null or p_radius_m is null
           or (v.location is not null and st_dwithin(v.location, v_point, p_radius_m)))
      and (v_norm is null
           or public.f_unaccent(lower(v.name)) like '%' || v_like || '%' escape '\'
           or public.f_unaccent(lower(coalesce(v.description, ''))) like '%' || v_like || '%' escape '\'
           or public.f_unaccent(lower(v.name)) % v_norm
           or public.f_unaccent(lower(coalesce(v.description, ''))) % v_norm)
    union all
    select 'event'::text as kind, e.id,
           to_jsonb(e.*) || jsonb_build_object('venues', jsonb_build_object('name', ev.name)) as item,
           case when v_point is not null and ev.location is not null
             then st_distance(ev.location, v_point) end as dist,
           e.created_at, null::double precision as rating, null::integer as review_count,
           (nullif(btrim(e.cover_image_url), '') is not null) as has_cover,
           case when v_norm is not null then greatest(
             case when public.f_unaccent(lower(e.title)) = v_norm then 1.0
                  when public.f_unaccent(lower(e.title)) like v_like || '%' escape '\' then 0.97
                  when public.f_unaccent(lower(e.title)) like '%' || v_like || '%' escape '\' then 0.9
                  else 0 end,
             word_similarity(v_norm, public.f_unaccent(lower(e.title))),
             similarity(public.f_unaccent(lower(e.title)), v_norm)) end as sim
    from public.events e
    left join public.venues ev on ev.id = e.venue_id
    where e.market = p_market
      and coalesce(e.end_time, e.start_time) >= now()
      and (p_starts_before is null or e.start_time <= p_starts_before)
      and (not p_featured or e.is_featured)
      and (p_kinds is null or 'event' = any(p_kinds))
      and (p_categories is null or e.category = any(p_categories))
      and (v_point is null or p_radius_m is null
           or (ev.location is not null and st_dwithin(ev.location, v_point, p_radius_m)))
      and (v_norm is null
           or public.f_unaccent(lower(e.title)) like '%' || v_like || '%' escape '\'
           or public.f_unaccent(lower(e.title)) % v_norm)
  ),
  scored as (
    select c.*, (
      (case p_sort
        when 'distance'  then round(coalesce(c.dist, 1e12))
        when 'rating'    then round(coalesce(c.rating, -1) * 1000)
        when 'trending'  then round(coalesce(c.rating, 0) * ln(coalesce(c.review_count, 0) + 1) * 1000)
        when 'relevance' then round(coalesce(c.sim, 0)::numeric * 1000000)
        when 'gems'      then round(coalesce(c.rating, -1) * 1000)
                             - case when coalesce(c.review_count, 0) between 3 and 300 then 0 else 200000 end
        else floor(extract(epoch from c.created_at) * 1000)
      end)
      -- image-first bias: photo-less listings sink to the bottom of every result set
      + case when (v_asc <> c.has_cover) then 1e15 else 0 end
    )::double precision as sort_v
    from cand c
  )
  select s.kind, s.item, s.dist, s.sort_v, s.id
  from scored s
  where p_cursor is null
     or (v_asc     and (s.sort_v > v_cur_v or (s.sort_v = v_cur_v and s.id > v_cur_id)))
     or (not v_asc and (s.sort_v < v_cur_v or (s.sort_v = v_cur_v and s.id < v_cur_id)))
  order by
    case when v_asc then s.sort_v end asc  nulls last,
    case when not v_asc then s.sort_v end desc nulls last,
    case when v_asc then s.id end asc,
    case when not v_asc then s.id end desc
  limit v_limit;
end $$;

grant execute on function public.discover(text, text[], text, double precision, double precision, double precision, text[], text, jsonb, integer, timestamptz, boolean) to anon, authenticated;
