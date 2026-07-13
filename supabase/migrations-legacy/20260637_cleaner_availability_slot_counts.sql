-- Marketplace intelligence: optional denormalized slot hints per availability window.
-- NULL means "derive from roster + bookings" in application code.

alter table public.cleaner_availability
  add column if not exists available_slots smallint;

alter table public.cleaner_availability
  add column if not exists booked_slots smallint;

comment on column public.cleaner_availability.available_slots is
  'Optional cap of bookable slots in this window for marketplace scoring/pricing; NULL if unknown.';

comment on column public.cleaner_availability.booked_slots is
  'Optional count of slots already consumed in this window; NULL if maintained only in app layer.';
