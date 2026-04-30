-- Immutable pricing context at booking time (line-item parity enforced in app).

alter table public.bookings
  add column if not exists price_snapshot jsonb;

comment on column public.bookings.price_snapshot is
  'Structured snapshot: service_type, base_price, extras[], total_price (ZAR) at booking time.';
