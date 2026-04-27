alter table public.bookings
  add column if not exists payment_link_expires_at timestamptz;

comment on column public.bookings.payment_link_expires_at is
  'When the stored Paystack authorization_url should be treated as stale (admin / ops UX).';
