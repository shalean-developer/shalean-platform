-- Optional timestamp when customer payment is confirmed (webhooks / manual); used for earnings recompute heuristics.
alter table public.bookings add column if not exists paid_at timestamptz;

comment on column public.bookings.paid_at is
  'Customer payment confirmed at (e.g. Paystack success). Used alongside payment_status and cent totals for stuck display repair.';
