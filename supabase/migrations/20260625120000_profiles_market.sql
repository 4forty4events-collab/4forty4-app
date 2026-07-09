-- A user's home market is identity, not a session preference (DZD vs USD pricing,
-- per-market content isolation). Nullable + no default: null means "we don't know
-- yet," which is distinct from defaulting everyone to DZ. Populated organically when
-- a logged-in user first toggles market in Browse (see MarketProvider), since the
-- OTP/signup flow is frozen until pre-launch.
alter table public.profiles
  add column market text check (market in ('DZ','ZW'));
