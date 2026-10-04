-- MASTER-00B-06 — pin search_path for frozen payout immutability trigger.
-- The function uses pg_catalog built-ins and explicitly schema-qualified
-- public.cleaner_payouts.

alter function public.bookings_trg_payout_frozen_immutable_after_eligible()
  set search_path = pg_catalog;
