-- App render language, persisted per user (cross-device). Distinct from
-- profiles.languages[] which is "languages the user speaks" (a content signal) —
-- this is the single locale the UI renders in.
alter table public.user_settings
  add column if not exists app_language text not null default 'en';

alter table public.user_settings drop constraint if exists user_settings_app_language_check;
alter table public.user_settings add constraint user_settings_app_language_check
  check (app_language in ('en', 'fr', 'ar'));
