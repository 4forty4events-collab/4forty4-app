-- A second demo drop per market so the hero carousel is swipeable end-to-end, and so the
-- frosted TEASER state (drop_at in the future) is visible next to the live one. Guarded by
-- title so re-apply is a no-op.

insert into public.premium_drops (market, title, teaser, venue_name, category, cover_image_url, drop_at, ends_at)
select 'DZ', 'Midnight Courtyard — Algiers', 'An address revealed only to the 44.',
       'Undisclosed · Algiers', 'nightlife',
       'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200',
       now() + interval '4 hours', now() + interval '30 days'
where not exists (select 1 from public.premium_drops where market = 'DZ' and title = 'Midnight Courtyard — Algiers');

insert into public.premium_drops (market, title, teaser, venue_name, category, cover_image_url, drop_at, ends_at)
select 'ZW', 'Lakeside Sessions — Harare', 'Sunset coordinates unlock at zero.',
       'Undisclosed · Harare', 'nightlife',
       'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1200',
       now() + interval '4 hours', now() + interval '30 days'
where not exists (select 1 from public.premium_drops where market = 'ZW' and title = 'Lakeside Sessions — Harare');
