-- ============================================================================
-- BACKFILL: strict primary category for existing venues + events
--
-- Mirrors resolveCategory() in lib/categories.js. The app already resolves the
-- correct category at read time (normalizeVenue/normalizeEvent), so DISPLAY is
-- correct without this script -- this exists so the stored column agrees, which
-- matters for anything that filters server-side (the `discover` RPC's
-- p_categories, idx_venues_market_cat, category facets).
--
-- HOW TO RUN: paste into the Supabase SQL editor, in stages. This file is
-- deliberately NOT in supabase/migrations/ -- the migration history is out of
-- sync with prod, so `db push` must not pick it up.
--
--   Stage 1  create the function            (safe, no data change)
--   Stage 2  PREVIEW                        (read-only -- review before Stage 3)
--   Stage 3  UPDATE                         (the only writing step)
--   Stage 4  verify
--
-- Stage 3 is idempotent: re-running it changes nothing once applied, because it
-- only touches rows whose resolved category differs from what is stored.
-- ============================================================================


-- == STAGE 1 =================================================================
-- Precedence, identical to the JS:
--   junk -> STRONG name -> raw -> canonical passthrough -> WEAK name -> 'other'
-- First match wins, so the arms are ordered most-specific-first (hotel outranks
-- restaurant: "Hotel Sofitel Restaurant Le Jardin" -> hotel).
--
-- STRONG vs WEAK name rules is the important distinction. STRONG words name the
-- venue type and cannot mean much else ("Hotel", "Pizzeria", "Nightclub"), so they
-- override a wrong source category -- the whole point of the exercise. WEAK words
-- ("Club", "Bar", "Villa", "Expo") routinely appear in proper names of things that
-- are NOT that: "Golf Club", "Club des Pins" (a beach), "Villa Abd-el-Tif" (a
-- museum). Those only apply where the source category gave us nothing, so a
-- correctly-tagged venue is never corrupted by its own name.
--
-- NOTE ON REGEX DIALECT: Postgres uses \y for a word boundary, NOT \b (\b is a
-- backspace here). Source types arrive snake_case ('night_club'), and _ is a word
-- character, so separators are flattened to spaces before any rule runs.

create or replace function public.resolve_category(p_raw text, p_name text)
returns text
language sql
immutable
as $$
  with n as (
    select
      coalesce(trim(p_name), '')                                         as title,
      coalesce(trim(p_raw), '')                                          as raw,
      regexp_replace(lower(coalesce(trim(p_raw), '')), '[_-]+', ' ', 'g') as raw_text
  )
  select case

    -- 1. JUNK: non-venues that leak in from scraped feeds (job posts, agencies,
    --    admin). These go to the hidden 'other' bucket.
    when (title <> '' and title ~* '\y(jobs?|hiring|recruit\w*|vacanc\w*|emploi|career|staffing|agence|agency|voyages?|assurance|insurance|banque|bank|pharmac\w+|clinique|clinic|hopital|hospital|consulat|ambassade|notaire|immobili\w+|real estate|auto ?ecole|driving school)\y')
      or (raw_text <> '' and raw_text ~* '\y(jobs?|hiring|recruit\w*|vacanc\w*|emploi|career|staffing|agence|agency|voyages?|assurance|insurance|banque|bank|pharmac\w+|clinique|clinic|hopital|hospital|consulat|ambassade|notaire|immobili\w+|real estate|auto ?ecole|driving school)\y')
      then 'other'

    -- 2. STRONG NAME RULES. Unambiguous type words, which deliberately OVERRIDE a
    --    messy source category.
    when title ~* '\y(hotels?|h[oô]tels?|resorts?|lodges?|lodging|inns?|motels?|hostels?|guest ?houses?|guesthouses?|riad|auberge|bed and breakfast|b ?& ?b)\y' then 'hotel'
    when title ~* '\y(night ?clubs?|nightclubs?|lounges?|pubs?|taverns?|cocktails?|discoth[eè]que|cabaret|speakeasy|shisha|hookah)\y' then 'nightlife'
    when title ~* '\y(restaurants?|resto|grill ?house|steak ?house|pizzerias?|pizza|burgers?|kebab|shawarma|sushi|bistros?|brasseries?|braai|diners?|eatery|buffet|trattoria|taqueria|bbq|barbecue|rotisserie)\y' then 'restaurant'
    when title ~* '\y(caf[eé]s?|coffee|espresso|roaster(?:y|s)?|tea ?house|salon de th[eé]|p[aâ]tisserie|patisserie|bakery|boulangerie|cr[eê]perie|gelato|ice ?cream|juice ?bar)\y' then 'cafe'
    when title ~* '\y(concerts?|live music|dj set|open mic|jam session|afrobeats? night)\y' then 'music_event'
    when title ~* '\y(festivals?|carnival)\y' then 'festival'
    when title ~* '\y(cinemas?|movie theat(?:re|er)|arcades?|bowling|karting|go.?karts?|paintball|laser ?(?:tag|game)|escape (?:room|game)|jeu d''evasion|trampoline|amusement|theme park|water ?park|parc aquatique|aqua ?park|mini ?golf|zoo|aquarium)\y' then 'entertainment'

    -- 3. RAW RULES on the source category/type string. Note cafe is tested BEFORE
    --    restaurant here (a "coffee shop" type must not fall into restaurant),
    --    which is the reverse of the name ordering above -- same as the JS.
    when raw_text ~* '(hotel|lodging|resort|hostel|guest ?house|riad|motel|auberge|accommodation)' then 'hotel'
    when raw_text ~* '(\ybar\y|\ypub\y|\yclub\y|lounge|nightlife|night ?club|discoth)' then 'nightlife'
    when raw_text ~* '(cafe|coffee|tea ?house|salon de the|bakery|patisserie|pastry|creperie|ice ?cream|glacier|gelato)' then 'cafe'
    when raw_text ~* '(restaurant|food|diner|eatery|grill|pizz|burger|steak|kebab|fast ?food|take ?away|take ?out|meal|snack)' then 'restaurant'
    when raw_text ~* '(concert|live music|music|dj|gig)' then 'music_event'
    when raw_text ~* '(festival|carnival|expo|\yfair\y)' then 'festival'
    when raw_text ~* '(amusement|theme ?park|water ?park|arcade|bowling|karting|go.?kart|paintball|laser|escape|trampoline|adventure ?park|mini ?golf|gaming|cinema|movie theater|\yzoo\y|aquarium|playground|entertainment)' then 'entertainment'
    when raw_text ~* '(spa|hammam|wellness|massage|thermal|thalasso|gym|fitness)' then 'wellness'
    when raw_text ~* '(museum|gallery|\yart\y|theater|theatre|cultur|monument|heritage|palace|palais|castle|casbah|historic)' then 'culture'
    when raw_text ~* '(park|garden|jardin|beach|plage|hiking|nature|forest|foret|trail|outdoor|promenade|corniche|viewpoint|point de vue|marina|lake|waterfall|scenic|cable ?car|telepherique|gondola)' then 'outdoor'
    when raw_text ~* '(mall|store|\yshop|market|boutique|souk|bazaar)' then 'shopping'
    when raw_text ~* '(stadium|\ysport|arena|pitch|court|equitation|horse|quad|jet ?ski|nautical)' then 'sports'
    when raw_text ~* '(touris|attraction|sightseeing|landmark)' then 'tourism'
    when raw_text ~* '(school|university|library|workshop|course|learning|education)' then 'education'
    when raw_text ~* '(meetup|networking|community event)' then 'meetup'

    -- 4. PASSTHROUGH: the stored value is already one of ours, so it is a real
    --    classification and an AMBIGUOUS name word must not override it. 'other'
    --    is excluded -- it is the junk bucket, so a weak rule may still rescue it.
    when raw <> 'other' and raw = any (array['restaurant','cafe','nightlife','music_event','festival','sports',
                                             'outdoor','tourism','hotel','shopping','wellness','culture',
                                             'entertainment','education','meetup']) then raw

    -- 5. WEAK NAME RULES: fallback only, for listings the source never usefully
    --    categorised. 6. otherwise the junk bucket.
    when title ~* '\y(chalets?|villas?)\y' then 'hotel'
    when title ~* '\y(clubs?|bars?|disco)\y' then 'nightlife'
    when title ~* '\y(grills?|kitchen|noodle)\y' then 'restaurant'
    when title ~* '\y(glacier)\y' then 'cafe'
    when title ~* '\y(gigs?)\y' then 'music_event'
    when title ~* '\y(fest|expo|fair(?:grounds?)?)\y' then 'festival'
    else 'other'
  end
  from n;
$$;


-- == STAGE 2: PREVIEW (read-only) ============================================
-- RUN THESE AND READ THE OUTPUT BEFORE STAGE 3. Nothing here writes.

-- 2a. Shape of the change: how many venues move, and from what to what.
select
  v.category                                as from_category,
  public.resolve_category(v.category, v.name) as to_category,
  count(*)                                  as n
from public.venues v
where public.resolve_category(v.category, v.name) is distinct from v.category
group by 1, 2
order by n desc;

-- 2b. Sample the rows that move, so you can eyeball that the calls are right.
--     Pay attention to anything landing in 'other' -- that is the hidden bucket
--     and those listings stop appearing in browse.
select
  v.name,
  v.category                                as from_category,
  public.resolve_category(v.category, v.name) as to_category,
  v.market
from public.venues v
where public.resolve_category(v.category, v.name) is distinct from v.category
order by v.category, v.name
limit 200;

-- 2c. Everything about to be hidden. Review this list specifically -- a false
--     positive here removes a real venue from the catalog.
select v.id, v.name, v.category as from_category, v.market
from public.venues v
where public.resolve_category(v.category, v.name) = 'other'
  and v.category is distinct from 'other'
order by v.name;

-- 2d. Same shape check for events (matched on title, not name).
select
  e.category                                 as from_category,
  public.resolve_category(e.category, e.title) as to_category,
  count(*)                                   as n
from public.events e
where public.resolve_category(e.category, e.title) is distinct from e.category
group by 1, 2
order by n desc;


-- == STAGE 3: THE UPDATE =====================================================
-- Only run once Stage 2 looks right. Wrapped in a transaction so venues and
-- events move together. The WHERE clause makes it idempotent and keeps the row
-- count honest -- unchanged rows are never touched.

begin;

update public.venues v
set category = public.resolve_category(v.category, v.name)
where public.resolve_category(v.category, v.name) is distinct from v.category;

update public.events e
set category = public.resolve_category(e.category, e.title)
where public.resolve_category(e.category, e.title) is distinct from e.category;

commit;


-- == STAGE 4: VERIFY =========================================================

-- 4a. Should return zero rows: nothing left to resolve.
select count(*) as venues_still_unresolved
from public.venues v
where public.resolve_category(v.category, v.name) is distinct from v.category;

-- 4b. Final category distribution per market.
select market, category, count(*) as n
from public.venues
group by 1, 2
order by market, n desc;
