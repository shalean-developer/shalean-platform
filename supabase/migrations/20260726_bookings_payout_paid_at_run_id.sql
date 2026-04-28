-- Real payout timestamp (distinct from booking.updated_at) and optional batch correlation for admin runs.
alter table public.bookings add column if not exists payout_paid_at timestamptz;
alter table public.bookings add column if not exists payout_run_id uuid;

comment on column public.bookings.payout_paid_at is
  'When payout_status was set to paid (e.g. admin invoice payout run).';
comment on column public.bookings.payout_run_id is
  'Shared UUID for all bookings marked paid in the same mark-paid action (audit / reconciliation).';
