-- Google OAuth support. The trap: profiles.phone was NOT NULL and
-- handle_new_user() inserted (id, phone) from new.phone — an OAuth (Google)
-- signup has a null phone, so the trigger would violate NOT NULL and FAIL the
-- whole signup. Fix: phone becomes nullable, add email, and populate the trigger
-- from whichever identity the user signed up with (email for OAuth, phone for
-- legacy). Existing rows and the admin user are untouched (on conflict do nothing).

alter table public.profiles alter column phone drop not null;
alter table public.profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone, email, full_name, avatar_url)
  values (
    new.id,
    new.phone,
    new.email,
    -- Google puts the display name under full_name or name, and the photo under
    -- avatar_url or picture, in raw_user_meta_data.
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
