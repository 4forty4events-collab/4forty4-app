-- Feed F2: user "moments" — real user-generated posts (photo + caption + optional place
-- tag), with likes and comments. Builds on public_profiles (author display) and the R2
-- media pipeline (photo_urls are permanent public URLs the client uploads before insert).

-- ============================================================================
-- 1) POSTS — a user moment. photo_urls are already-hosted R2 URLs.
-- ============================================================================
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  body          text,
  photo_urls    text[] not null default '{}',
  venue_id      uuid references public.venues(id) on delete set null,
  event_id      uuid references public.events(id) on delete set null,
  market        text,
  like_count    int not null default 0,
  comment_count int not null default 0,
  status        text not null default 'published',   -- published | hidden (moderation)
  created_at    timestamptz not null default now()
);
create index if not exists posts_market_created_idx on public.posts (market, created_at desc) where status = 'published';
create index if not exists posts_user_idx on public.posts (user_id, created_at desc);

alter table public.posts enable row level security;
-- Published posts are public reading; you always see your own (any status). Write only your own.
drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts for select using (status = 'published' or auth.uid() = user_id);
drop policy if exists "posts self insert" on public.posts;
create policy "posts self insert" on public.posts for insert with check (auth.uid() = user_id);
drop policy if exists "posts self update" on public.posts;
create policy "posts self update" on public.posts for update using (auth.uid() = user_id);
drop policy if exists "posts self delete" on public.posts;
create policy "posts self delete" on public.posts for delete using (auth.uid() = user_id);

-- ============================================================================
-- 2) POST_LIKES — one row per (post, user). like_count on posts is trigger-maintained.
-- ============================================================================
create table if not exists public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_user_idx on public.post_likes (user_id);

alter table public.post_likes enable row level security;
drop policy if exists "post_likes readable" on public.post_likes;
create policy "post_likes readable" on public.post_likes for select using (auth.uid() is not null);
drop policy if exists "post_likes self insert" on public.post_likes;
create policy "post_likes self insert" on public.post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "post_likes self delete" on public.post_likes;
create policy "post_likes self delete" on public.post_likes for delete using (auth.uid() = user_id);

-- ============================================================================
-- 3) POST_COMMENTS — schema provisioned now; the compose/list UI lands in F2.1.
-- ============================================================================
create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;
drop policy if exists "post_comments readable" on public.post_comments;
create policy "post_comments readable" on public.post_comments for select using (auth.uid() is not null);
drop policy if exists "post_comments self insert" on public.post_comments;
create policy "post_comments self insert" on public.post_comments for insert with check (auth.uid() = user_id);
drop policy if exists "post_comments self delete" on public.post_comments;
create policy "post_comments self delete" on public.post_comments for delete using (auth.uid() = user_id);

-- ============================================================================
-- 4) COUNTER TRIGGERS — keep like_count / comment_count exact.
-- ============================================================================
create or replace function public.bump_post_like_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_post_like_count on public.post_likes;
create trigger trg_post_like_count after insert or delete on public.post_likes
  for each row execute function public.bump_post_like_count();

create or replace function public.bump_post_comment_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_post_comment_count on public.post_comments;
create trigger trg_post_comment_count after insert or delete on public.post_comments
  for each row execute function public.bump_post_comment_count();
