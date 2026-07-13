alter table public.bookings
  add column if not exists surge_reason text;
