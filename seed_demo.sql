-- ============================================================================
-- 4forty4 — DEMO SEED for a promo video (Algeria / DZ market).
-- Paste this whole file into the Supabase SQL editor and Run once.
-- Idempotent: every insert is guarded, so re-running is safe (no duplicates).
--
-- What it seeds (venues already exist — 1,358 of them — so this only ADDS the gaps):
--   • Flags ~6 top venues as Featured (Featured Today / Premium shelves).
--   • ~8 UPCOMING events (Daily Pulse / This Weekend / today's events / Feed event card).
--   • 1 LIVE 4Forty4 Drop (the Daily Pulse hero, 17/44 claimed).
--   • 6 merch products (the store lookbook).
--   • 5 reviews-with-photos BY YOU → Community section + real Feed posts (hero/carousel/etc).
--   • Saved favourites + a Collection + a Budget outing under your account (Saved / Outings).
--
-- Your account is resolved by email; change it here if needed:
-- ============================================================================

-- ── 1) Feature a handful of good venues ──────────────────────────────────────
update public.venues
set is_featured = true
where id in (
  select id from public.venues
  where market = 'DZ' and cover_image_url is not null
  order by rating desc nulls last, review_count desc nulls last
  limit 6
);

-- ── 2) Upcoming events (times are relative to NOW so they're always "upcoming") ─
with picks as (
  select id, city, row_number() over (order by rating desc nulls last) as rn
  from public.venues
  where market = 'DZ' and cover_image_url is not null
  order by rating desc nulls last
  limit 8
),
me as (select id as uid from auth.users where email = '4forty4events@gmail.com')
insert into public.events
  (venue_id, created_by, title, description, category, cover_image_url,
   start_time, end_time, is_free, city, market, tags,
   price, currency, price_dzd, price_per_person, price_type, duration_days, is_featured)
select p.id, (select uid from me), e.title, e.descr, e.cat, e.img,
       now() + make_interval(hours => e.hrs),
       now() + make_interval(hours => e.hrs + 3),
       false, coalesce(p.city, 'Algiers'), 'DZ', e.tags,
       e.price, 'DZD', e.price, e.price, 'per_person', 1, e.feat
from picks p
join (values
  (1, 'Afrobeats Night',                'The city''s best afrobeats DJs take over the rooftop till late.', 'music_event',   'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200', 3,  array['nightlife','music'],       2000, true),
  (2, 'Rooftop Jazz Sessions',          'Live jazz quartet as the sun sets over the bay.',                 'music_event',   'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=1200', 6,  array['music','culture'],         1500, false),
  (3, 'Casbah Street Food Festival',    'A weekend of Algiers'' best street food, sweets and mint tea.',   'festival',      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200', 26, array['food','family'],           1000, true),
  (4, 'Sunset Beach Party — Sidi Fredj','Sundowners, house music and the Mediterranean.',                  'nightlife',     'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200', 50, array['nightlife','outdoor'],     2500, false),
  (5, 'Contemporary Art Night',         'A late opening at the city''s boldest gallery.',                  'culture',       'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=1200', 74, array['culture','art'],            800, false),
  (6, 'Weekend Hike — Chréa',           'A guided hike through the cedar forests above Blida.',            'outdoor',       'https://images.unsplash.com/photo-1551632811-561732d1e306?w=1200', 60, array['outdoor','group_friendly'],1200, false),
  (7, 'Comedy Night Algiers',           'The country''s sharpest stand-ups, one small room.',              'entertainment', 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=1200', 30, array['entertainment'],           1500, false),
  (8, 'Coffee & Vinyl Morning',         'Slow coffee and a crate-dig of North African vinyl.',             'cafe',          'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200', 20, array['cafe','music'],             600, false)
) as e(rn, title, descr, cat, img, hrs, tags, price, feat) on e.rn = p.rn
where not exists (select 1 from public.events x where x.title = e.title and x.market = 'DZ');

-- ── 3) The 4Forty4 Drop — one LIVE drop (17 of 44 claimed) ───────────────────
insert into public.premium_drops
  (market, title, teaser, venue_name, category, cover_image_url, drop_at, ends_at, allocation, claimed_count, status)
select 'DZ', 'Rooftop Secret Set — Algiers', 'A hidden rooftop. One night. 44 spots.',
       'Undisclosed · Algiers', 'nightlife',
       'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200',
       now() - interval '2 minutes', now() + interval '30 days', 44, 17, 'live'
where not exists (select 1 from public.premium_drops where market = 'DZ');

-- ── 4) Merch lookbook ────────────────────────────────────────────────────────
insert into public.merch_products
  (name, category, kind, fabric, price_dzd, price_usd, images, theme, featured, active, sort_order)
select m.name, m.category, m.kind, m.fabric, m.price_dzd, m.price_usd, m.images::jsonb, m.theme, m.featured, true, m.sort_order
from (values
  ('TOZVINZWISISA Ember Tee', 'TEE',      'FLAGSHIP DROP', '240gsm heavyweight cotton', 4500, 25, '["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800"]', 'ember', true,  1),
  ('Night Rider Hoodie',      'HOODIE',   'CAPSULE',       '400gsm brushed fleece',     8500, 45, '["https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800"]', 'sea',   false, 2),
  ('Sea Signal Cap',          'HEADWEAR', 'CAPSULE',       'structured 6-panel',        3000, 18, '["https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=800"]', 'sea',   false, 3),
  ('Gold Standard Tee',       'TEE',      'CAPSULE',       'pima cotton',               5000, 28, '["https://images.unsplash.com/photo-1583743814966-8936f37f4678?w=800"]', 'gold',  true,  4),
  ('Ember Crewneck',          'HOODIE',   'CAPSULE',       'ringspun cotton fleece',    6500, 36, '["https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800"]', 'ember', false, 5),
  ('Warehouse Beanie',        'HEADWEAR', 'CAPSULE',       'merino blend',              2500, 15, '["https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=800"]', 'gold',  false, 6)
) as m(name, category, kind, fabric, price_dzd, price_usd, images, theme, featured, sort_order)
where not exists (select 1 from public.merch_products mp where mp.name = m.name);

-- ── 5) Reviews-with-photos BY YOU → Community + real Feed posts ───────────────
with pv as (
  select id, row_number() over (order by rating desc nulls last) as rn
  from public.venues
  where market = 'DZ' and cover_image_url is not null
  order by rating desc nulls last
  limit 5
),
me as (select id as uid from auth.users where email = '4forty4events@gmail.com')
insert into public.reviews (user_id, venue_id, rating, body, photo_urls, status, market)
select (select uid from me), pv.id, r.rating, r.body, r.photos, 'published', 'DZ'
from pv
join (values
  (1, 5, 'Best rooftop for sunsets — hidden gem with insane views and even better coffee. ☕ #Rooftop #Coffee #Views',
      array['https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1000']),
  (2, 5, 'Perfect weekend escape ☀️ The views over the bay are unreal — bring the whole crew.',
      array['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000','https://images.unsplash.com/photo-1519046904884-53103b34b206?w=1000','https://images.unsplash.com/photo-1551024506-0bccd828d307?w=1000']),
  (3, 4, 'Best burger in town, hands down. Come hungry. 🍔',
      array['https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1000']),
  (4, 5, 'Morning ritual done right — the flat white here is elite. ☕',
      array['https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1000']),
  (5, 4, 'Buzzing spot — great crowd, even better music. Stayed way past midnight.',
      array['https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1000'])
) as r(rn, rating, body, photos) on r.rn = pv.rn
on conflict (user_id, venue_id) where venue_id is not null do nothing;

-- ── 6) Saved favourites (Saved → Favorites) ──────────────────────────────────
with me as (select id as uid from auth.users where email = '4forty4events@gmail.com'),
top4 as (
  select id from public.venues
  where market = 'DZ' and cover_image_url is not null
  order by rating desc nulls last limit 4
)
insert into public.saved_items (user_id, venue_id, list_type)
select (select uid from me), t.id, 'favorite'
from top4 t
where not exists (
  select 1 from public.saved_items s
  where s.user_id = (select uid from me) and s.venue_id = t.id
);

-- ── 7) A named Collection with items (Saved → Collections) ────────────────────
with me as (select id as uid from auth.users where email = '4forty4events@gmail.com'),
c as (
  insert into public.collections (user_id, name, emoji, is_pinned)
  select (select uid from me), 'Date night in Algiers', '🌙', true
  where not exists (
    select 1 from public.collections
    where user_id = (select uid from me) and name = 'Date night in Algiers'
  )
  returning id
)
insert into public.collection_items (collection_id, venue_id)
select c.id, v.id
from c
cross join (
  select id from public.venues
  where market = 'DZ' and cover_image_url is not null
  order by rating desc nulls last limit 4
) v;

-- ── 8) A Budget outing with stops (Outings tab) ──────────────────────────────
with me as (select id as uid from auth.users where email = '4forty4events@gmail.com'),
p as (
  insert into public.budget_plans (user_id, name, total_budget, currency, market, plan_type)
  select (select uid from me), 'Weekend in Algiers', 8000, 'DZD', 'DZ', 'single_day'
  where not exists (
    select 1 from public.budget_plans
    where user_id = (select uid from me) and name = 'Weekend in Algiers'
  )
  returning id
)
insert into public.budget_items (plan_id, venue_id, est_cost, source)
select p.id, v.id, coalesce(v.price_per_person, 1000), 'auto'
from p
cross join (
  select id, price_per_person from public.venues
  where market = 'DZ' and cover_image_url is not null
  order by rating desc nulls last limit 3
) v;

-- ── 9) Unread notifications BY YOU → the bell badge ──────────────────────────
with me as (select id as uid from auth.users where email = '4forty4events@gmail.com')
insert into public.notifications (user_id, type, title, body, route, market, read_at, created_at)
select (select uid from me), n.type, n.title, n.body, n.route, 'DZ', null, now() - make_interval(mins => n.mins)
from (values
  ('recommendation', '5 new spots for you',            'Places we think you''ll love around Algiers.',           'Feed',       12),
  ('event_reminder', 'Tonight: Afrobeats Night',       'The rooftop set starts in a few hours — don''t miss it.', 'DailyPulse', 45),
  ('new_follower',   'New follower',                    'TravelWithZ started following you.',                     'Activity',   90),
  ('nearby_alert',   'Something''s happening nearby',   'A secret rooftop drop just went live near you.',         'DailyPulse', 180)
) as n(type, title, body, route, mins)
where not exists (
  select 1 from public.notifications x
  where x.user_id = (select uid from me) and x.title = n.title
);

-- ── Report ───────────────────────────────────────────────────────────────────
select
  (select count(*) from public.venues where market='DZ' and is_featured) as featured_venues,
  (select count(*) from public.events where market='DZ' and start_time >= now()) as upcoming_events,
  (select count(*) from public.premium_drops where market='DZ') as drops,
  (select count(*) from public.merch_products where active) as merch,
  (select count(*) from public.reviews where market='DZ') as reviews,
  (select count(*) from public.notifications n
     where n.read_at is null
       and n.user_id = (select id from auth.users where email='4forty4events@gmail.com')) as unread_notifications;
