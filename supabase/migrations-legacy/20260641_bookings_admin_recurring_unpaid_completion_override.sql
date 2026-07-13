-- Persist explicit admin lifecycle override when completing a recurring-unpaid (pending_payment) visit.
-- Surfaces in describeBookingOperationalState / admin + cleaner timelines (operationally visible truth).

alter table public.bookings
  add column if not exists admin_recurring_unpaid_completion_override_at timestamptz;

alter table public.bookings
  add column if not exists admin_recurring_unpaid_completion_override_by text;

comment on column public.bookings.admin_recurring_unpaid_completion_override_at is
  'Set when an admin marks completed while the visit was recurring cleaner-visible pending_payment; cleaner travel/start/complete were policy-locked until this override.';

comment on column public.bookings.admin_recurring_unpaid_completion_override_by is
  'Admin identity (email preferred) recorded with admin_recurring_unpaid_completion_override_at.';
