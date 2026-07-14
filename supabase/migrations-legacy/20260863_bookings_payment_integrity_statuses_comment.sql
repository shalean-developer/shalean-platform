-- Document payment integrity lifecycle statuses on `bookings.status` (text; no enum).
comment on column public.bookings.status is
  'Lifecycle: pending_payment (pre-Paystack), pending (paid, dispatch), assigned, etc.; integrity: payment_mismatch, payment_reconciliation_required (Day 4).';
