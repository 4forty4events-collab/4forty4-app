-- Feed F2.1: let users report a post (moderation). Extends the reports table with a
-- post_id target, alongside the existing venue/event/organizer targets. Idempotent.

alter table public.reports add column if not exists post_id uuid references public.posts(id) on delete cascade;
create index if not exists idx_reports_post on public.reports (post_id);

-- Allow 'post' as a report target type (the original inline check is auto-named
-- reports_target_type_check; drop + re-add with the wider set).
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('venue', 'event', 'organizer', 'post'));

-- Exactly one target must be set — now including post_id.
alter table public.reports drop constraint if exists reports_one_target;
alter table public.reports add constraint reports_one_target
  check (num_nonnulls(venue_id, event_id, organizer_id, post_id) = 1);
