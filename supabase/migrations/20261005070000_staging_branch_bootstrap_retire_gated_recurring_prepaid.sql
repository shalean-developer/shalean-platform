-- STAGING-BRANCH-BOOTSTRAP-01
-- Keep fresh non-production bootstraps aligned with the production-authority schema.
-- These recurring prepayment tables were prepared historically but intentionally
-- not promoted to production. Drop them idempotently if a fresh bootstrap replays
-- the historical prepared migration.

drop table if exists public.recurring_prepaid_allocations;
drop table if exists public.recurring_prepaid_packages;
