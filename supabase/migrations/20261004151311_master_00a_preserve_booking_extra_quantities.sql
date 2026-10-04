-- MASTER-00A staging convergence.
-- Production source of truth preserves bookings.extra_quantities in 20260919153000_production_schema_convergence.sql.
-- This additive guard makes the canonical booking extras quantity map explicit for staging and fresh environments.
alter table public.bookings
  add column if not exists extra_quantities jsonb not null default '{}'::jsonb;

comment on column public.bookings.extra_quantities is
  'Quantity per selected extra service ID, e.g. {"carpet-cleaning": 2}. selected_extras remains the backwards-compatible ID array.';
