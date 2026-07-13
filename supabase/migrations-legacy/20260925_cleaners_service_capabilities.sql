-- Operational capability flags (admin-managed). Distinct from cleaner *preferences*.
-- Default true preserves behaviour until ops explicitly restricts a cleaner.

alter table public.cleaners
  add column if not exists can_do_deep_cleaning boolean not null default true,
  add column if not exists can_do_move_cleaning boolean not null default true;

comment on column public.cleaners.can_do_deep_cleaning is
  'When false, cleaner must not be offered deep-cleaning jobs (dispatch eligibility).';
comment on column public.cleaners.can_do_move_cleaning is
  'When false, cleaner must not be offered move-in/out jobs (dispatch eligibility).';
