-- Track admin-recorded customer deposits separately from full settlement (payment_completed_at).

alter table public.bookings
  add column if not exists deposit_paid_cents integer;

alter table public.bookings drop constraint if exists bookings_deposit_paid_cents_nonneg;

alter table public.bookings
  add constraint bookings_deposit_paid_cents_nonneg
  check (deposit_paid_cents is null or deposit_paid_cents >= 0) not valid;

alter table public.bookings validate constraint bookings_deposit_paid_cents_nonneg;

comment on column public.bookings.deposit_paid_cents is
  'Deposit collected in cents (ZAR), recorded by admin. Full payment remains tracked via payment_completed_at / total_paid_cents.';
