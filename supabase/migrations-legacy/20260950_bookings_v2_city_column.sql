-- Booking Form V2: add city column that was missing from 20260948_bookings_v2_columns.sql.
-- suburb was added there but city was omitted; the confirm route sets both.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS city text;

COMMENT ON COLUMN public.bookings.city IS 'City for the booking address (e.g. Cape Town). Mirrors booking_snapshot.city.';
