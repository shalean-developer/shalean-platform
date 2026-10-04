-- MASTER-00B-04 — pin search_path for booking reference assignment.
-- The trigger body uses pg_catalog built-ins and an explicitly schema-qualified
-- public.bookings_reference_seq sequence.

alter function public.assign_booking_reference()
  set search_path = pg_catalog;
