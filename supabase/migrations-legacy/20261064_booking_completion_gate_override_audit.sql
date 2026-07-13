-- Phase 6: audit trail when admin completes despite cleaner completion-gate failures.

alter table public.bookings
  add column if not exists admin_completion_gate_override_at timestamptz,
  add column if not exists admin_completion_gate_override_by text,
  add column if not exists admin_completion_gate_override_reason text,
  add column if not exists admin_completion_gate_override_codes text[];

comment on column public.bookings.admin_completion_gate_override_at is
  'When set, admin completed the booking while cleaner completion gates (duration/timer/quote) were not satisfied.';
comment on column public.bookings.admin_completion_gate_override_by is
  'Admin email or user id that applied the completion-gate override.';
comment on column public.bookings.admin_completion_gate_override_reason is
  'Free-text admin reason recorded with the completion-gate override.';
comment on column public.bookings.admin_completion_gate_override_codes is
  'Cleaner completion gate codes bypassed by admin (e.g. minimum_duration_not_elapsed).';
