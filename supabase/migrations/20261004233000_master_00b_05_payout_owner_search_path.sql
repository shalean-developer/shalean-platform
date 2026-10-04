-- MASTER-00B-05 — pin search_path for booking payout-owner integrity trigger.
-- The function uses only pg_catalog built-ins plus explicitly schema-qualified
-- public.team_members and public.booking_cleaners relations.

alter function public.bookings_trg_ensure_payout_owner_in_team()
  set search_path = pg_catalog;
