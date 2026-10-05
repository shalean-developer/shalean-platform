-- MASTER-00B-07 — forward idempotent schema hardening.
-- Preserve this published migration version so repository history remains
-- compatible with any environment that already recorded 20261005014500.

alter function public.cleaner_payouts_block_mutate_when_frozen()
  set search_path = pg_catalog;
