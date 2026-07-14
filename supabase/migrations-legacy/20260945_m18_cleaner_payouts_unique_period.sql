-- M-18: weekly cleaner payout uniqueness invariant.
--
-- Problem
-- -------
-- Weekly payout generation in `generateWeeklyPayouts` (and the admin manual
-- /api/admin/payouts/generate route) inserts into `cleaner_payouts` without
-- any database-level uniqueness invariant on the canonical batch key. The
-- only fences before this migration were:
--
--   1. The H-15 cron lock on `cron:generate-payouts` (one runner at a time
--      across schedulers — see `20260941_cron_run_leases.sql`).
--   2. The post-insert `bookings.payout_id IS NULL` filter, which would link
--      0 bookings on the loser of a race so the just-inserted payout could be
--      deleted.
--
-- Both are application-level. They do not survive:
--   - the H-15 lock failing open (degraded mode in `cronLock.ts`);
--   - an admin manual trigger via `/api/admin/payouts/generate` racing the
--     cron (the admin route did NOT take the same lock before this work);
--   - retry storms after a 5xx where the previous insert already committed;
--   - any future call site that forgets to honour the application dedup.
--
-- Canonical uniqueness key
-- ------------------------
-- A weekly cleaner payout batch is canonically keyed by:
--   (cleaner_id, period_start, period_end)
--
-- `payout_run_id` is intentionally NOT part of the key — it is set later by
-- `createPayoutRun` once the row has been frozen. `payout_type` is also NOT
-- part of the key: `cleaner_payouts` has no `payout_type` column (that field
-- only exists on `bookings` to identify the per-booking payout model). The
-- weekly batch is one row per cleaner per Monday-Sunday UTC window
-- (see `apps/web/lib/payout/weekBounds.ts`).
--
-- `cancelled` rows are excluded from the uniqueness invariant because a
-- cancelled batch represents a soft-deleted mistake; cancelling and recreating
-- a fresh batch for the same `(cleaner, period)` must remain possible.
--
-- Defense in depth
-- ----------------
-- This migration adds a partial unique index. Combined with H-15 cron lock
-- (which prevents two runners from even entering the work) and the existing
-- in-app booking-link guard, we now have three independent fences. The DB
-- index is the only one that survives every degradation mode.
--
-- The 23505 unique-violation surfaced by this index is caught idempotently in
-- `apps/web/lib/payout/generateWeeklyPayouts.ts` so retries return without
-- error or partial state.
--
-- This migration does NOT touch payout formulas, payout eligibility, or any
-- column on `cleaner_payouts` other than the index itself.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Defensive cleanup: cancel any pre-existing duplicates so the unique index
-- creation cannot fail. Keep the most-recent non-cancelled row per
-- (cleaner_id, period_start, period_end); soft-cancel the older siblings.
--
-- This block is deliberately conservative:
--   - it only operates on rows where `frozen_at IS NULL` — frozen / approved /
--     paid rows must never be silently mutated (the
--     `cleaner_payouts_block_mutate_when_frozen` trigger would refuse anyway);
--   - it only flips status to 'cancelled' (allowed transition; the trigger
--     permits status changes for non-frozen rows);
--   - it leaves the most-recent row per key untouched.
--
-- Idempotent: a second run finds no duplicates and is a no-op.
-- ---------------------------------------------------------------------------
do $$
declare
  v_dup_count int;
begin
  with ranked as (
    select
      id,
      cleaner_id,
      period_start,
      period_end,
      status,
      frozen_at,
      row_number() over (
        partition by cleaner_id, period_start, period_end
        order by created_at desc, id desc
      ) as rn
    from public.cleaner_payouts
    where status <> 'cancelled'
  ),
  to_cancel as (
    select id
    from ranked
    where rn > 1
      and frozen_at is null
  )
  update public.cleaner_payouts cp
  set status = 'cancelled'
  from to_cancel
  where cp.id = to_cancel.id;

  get diagnostics v_dup_count = row_count;
  if v_dup_count > 0 then
    raise notice 'M-18 cleanup: cancelled % duplicate cleaner_payouts row(s) before adding unique index', v_dup_count;
  end if;
end $$;

-- If frozen duplicates remain after cleanup, the index creation will fail
-- with a unique-violation listing the offending key. That is the correct
-- behaviour — frozen money rows must be reconciled by ops before tightening
-- the invariant. The error surface ensures the migration cannot silently
-- mask an existing duplication bug.

-- ---------------------------------------------------------------------------
-- Partial unique index: at most one active (non-cancelled) cleaner_payouts
-- row per (cleaner_id, period_start, period_end).
-- ---------------------------------------------------------------------------
create unique index if not exists cleaner_payouts_unique_active_period_idx
  on public.cleaner_payouts (cleaner_id, period_start, period_end)
  where status <> 'cancelled';

comment on index public.cleaner_payouts_unique_active_period_idx is
  'M-18: defense-in-depth uniqueness invariant for weekly cleaner payout batches. Prevents duplicate payout rows for the same (cleaner_id, period_start, period_end) under H-15 lock failure, admin manual trigger races, or retry storms. Cancelled rows are excluded so cancel-and-recreate flows still work. Application catches the resulting 23505 idempotently in apps/web/lib/payout/generateWeeklyPayouts.ts.';

comment on column public.cleaner_payouts.period_start is
  'Inclusive start (UTC date) of the weekly batch window. Together with period_end and cleaner_id, forms the canonical batch identity enforced by cleaner_payouts_unique_active_period_idx.';

comment on column public.cleaner_payouts.period_end is
  'Inclusive end (UTC date) of the weekly batch window. Together with period_start and cleaner_id, forms the canonical batch identity enforced by cleaner_payouts_unique_active_period_idx.';
