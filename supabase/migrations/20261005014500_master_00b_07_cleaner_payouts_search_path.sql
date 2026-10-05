-- MASTER-00B-07 — pin search_path for cleaner payout immutability trigger.
-- The function uses only pg_catalog built-ins/operators and row values.
-- Branch-protection refresh: no semantic change.

alter function public.cleaner_payouts_block_mutate_when_frozen()
  set search_path = pg_catalog;
