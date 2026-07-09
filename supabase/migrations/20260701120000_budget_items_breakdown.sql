-- Auto-build now composes a RANDOMIZED meal (a real main + drink + dessert from
-- the menu's sections), so the picked items can't be recomputed deterministically
-- for display. Persist them alongside the frozen est_cost so the plan always
-- shows exactly what was chosen. Nullable: manual adds / no-menu items have none.
alter table public.budget_items add column if not exists breakdown jsonb;
