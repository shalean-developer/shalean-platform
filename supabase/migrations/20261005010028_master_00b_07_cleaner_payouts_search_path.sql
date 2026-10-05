-- MASTER-00B-07 — canonical production-ledger version.
-- Pins search_path for cleaner payout immutability trigger.

alter function public.cleaner_payouts_block_mutate_when_frozen()
  set search_path = pg_catalog;
