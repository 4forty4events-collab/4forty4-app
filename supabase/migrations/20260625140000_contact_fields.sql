-- Contact details for listings. All nullable — a listing may have none, one,
-- or all three. WhatsApp is stored as international digits only (no +, no
-- spaces) so it drops straight into a wa.me/ link; this matches the format
-- Supabase already stores auth phone numbers in (e.g. 213562196497).
alter table public.venues
  add column contact_whatsapp text,   -- intl digits only, no +, e.g. 213562196497
  add column contact_phone text,      -- as-dialed local or intl, for tel:
  add column contact_instagram text;  -- handle WITHOUT @, e.g. boutribicha_trips

alter table public.events
  add column contact_whatsapp text,
  add column contact_phone text,
  add column contact_instagram text;
