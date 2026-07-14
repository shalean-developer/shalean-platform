-- ============================================================================
-- M-24: historical dispatch_offers cleanup
-- ----------------------------------------------------------------------------
-- Problem
--   Some `dispatch_offers` rows are stuck `status='pending'` past `expires_at`
--   because earlier runtime expiry paths (`runDispatchTimeouts`,
--   `expire_pending_dispatch_offers` pg_cron, `accept_dispatch_offer_atomic`
--   peer-expiry) did not always run to completion (rate limits, lease
--   contention, abandoned cron windows). A subset is also missing the per-offer
--   `display_earnings_cents` snapshot introduced by migration
--   `20260934_dispatch_offers_earnings_snapshot.sql` because they were created
--   before that column existed.
--
-- Scope (HISTORICAL CLEANUP ONLY)
--   1. Expire stale pending offers: `status='pending' AND expires_at < now()`
--      become `status='expired'`. `responded_at` is set to `expires_at` (NOT
--      `now()`) so the audit trail accurately records WHEN the offer
--      effectively closed itself out, instead of fabricating a "responded
--      today" event for offers that died months ago.
--   2. Backfill `display_earnings_cents` ONLY where it is provably safe and
--      derivable from already-persisted booking state:
--        - the offer was `accepted` (i.e. the cleaner DID earn this);
--        - the booking's current `cleaner_id` matches the offer's
--          `cleaner_id` (prevents cross-attribution if the booking was later
--          reassigned);
--        - the booking is solo (`is_team_job IS NOT TRUE`) — for team jobs
--          `bookings.display_earnings_cents` is the team total, NOT the
--          per-cleaner share, so copying it would over-attribute;
--        - `bookings.display_earnings_cents` is non-null and positive;
--        - the offer's snapshot is currently NULL (additive write only;
--          never overwrites an existing snapshot).
--      All other historical rows (rejected, expired, team-accepted) keep
--      their NULL snapshot — re-deriving them risks attributing different
--      amounts than what the cleaner actually saw, and they are diagnostic
--      surfaces only (never used for payment).
--
-- Safety contract
--   - Active / future offers (`status='pending' AND expires_at > now()`)
--     are NEVER touched by this migration. A `WHERE expires_at < now()`
--     filter is the only mutation gate for the expiry update.
--   - No bookings, cleaner_payouts, cleaner_earnings, or any ledger row
--     is ever written. This migration only touches `dispatch_offers`.
--   - Offer creation logic is not changed. Payout formulas are not changed.
--     `bookings.display_earnings_cents` is the source of truth for the
--     backfill — same value the cleaner already saw on completion.
--   - Idempotent: re-running finds zero stale pending rows and zero
--     accepted-solo offers without snapshots. Subsequent runs are no-ops.
--   - Frozen accepted offers' snapshots are protected by the
--     `display_earnings_cents IS NULL` filter on the backfill update.
--
-- Verification
--   - `supabase/queries/m24_historical_dispatch_offers_cleanup_verify.sql`
--     reports the pre/post state of stale-pending and missing-snapshot
--     populations.
-- ============================================================================

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Step 0 (audit): emit pre-cleanup counts so the deploy log shows the size
-- of the cleanup that is about to run. Read-only.
-- ---------------------------------------------------------------------------
do $$
declare
  v_stale_pending bigint;
  v_accepted_solo_no_snapshot bigint;
  v_active_pending_unaffected bigint;
begin
  select count(*) into v_stale_pending
  from public.dispatch_offers d
  where d.status = 'pending'
    and d.expires_at < now();

  select count(*) into v_accepted_solo_no_snapshot
  from public.dispatch_offers d
  join public.bookings b on b.id = d.booking_id
  where d.status = 'accepted'
    and d.display_earnings_cents is null
    and b.cleaner_id = d.cleaner_id
    and coalesce(b.is_team_job, false) = false
    and b.display_earnings_cents is not null
    and b.display_earnings_cents > 0;

  select count(*) into v_active_pending_unaffected
  from public.dispatch_offers d
  where d.status = 'pending'
    and d.expires_at > now();

  raise notice 'M-24 audit: stale_pending=% accepted_solo_no_snapshot=% active_pending_unaffected=%',
    v_stale_pending, v_accepted_solo_no_snapshot, v_active_pending_unaffected;
end $$;

-- ---------------------------------------------------------------------------
-- Step 1: expire stale pending offers.
--
-- Mirror the runtime contract from
-- `apps/web/lib/dispatch/runDispatchTimeouts.ts` and
-- `expire_pending_dispatch_offers` pg_cron RPC: flip status pending → expired
-- and stamp `responded_at`. We deviate from the runtime convention by
-- stamping `expires_at` (the moment the offer truly closed) instead of
-- `now()`, because for very old stale rows `now()` would falsely imply
-- recent activity in `offer_timeout_metric` / dashboard queries.
--
-- The `WHERE status = 'pending'` filter is the only contract that prevents
-- racing the runtime: a row that was just expired by the cron between our
-- audit and this update is already 'expired' and is no-op'd out.
--
-- The partial unique index `dispatch_offers_one_pending_per_booking_uidx`
-- (where status = 'pending') only relaxes when these rows flip — no
-- duplicate-key risk.
-- ---------------------------------------------------------------------------
with stale as (
  select id, expires_at
  from public.dispatch_offers
  where status = 'pending'
    and expires_at < now()
  for update skip locked
)
update public.dispatch_offers d
set
  status = 'expired',
  responded_at = coalesce(d.responded_at, s.expires_at)
from stale s
where d.id = s.id
  and d.status = 'pending'
  and d.expires_at < now();

-- ---------------------------------------------------------------------------
-- Step 2: safe backfill of display_earnings_cents on accepted-solo offers
-- whose snapshot is null.
--
-- Source: `bookings.display_earnings_cents`, which for solo jobs is exactly
-- the cleaner's per-job display amount as written by
-- `persistCleanerPayoutIfUnset` (apps/web/lib/payout/persistCleanerPayout.ts).
-- This is the same value the cleaner already saw on the completed booking,
-- so backfilling here is a faithful historical record — it does NOT
-- recompute any formula.
--
-- Excluded:
--   - Team jobs (`bookings.is_team_job = true`): the booking's
--     display_earnings_cents column is the team total / pool, not a per-
--     cleaner share. Per-cleaner team earnings live in
--     `team_job_member_payouts` and `booking_cleaner_earnings_snapshot`.
--     Copying the booking total here would over-attribute.
--   - Cleaner mismatch (`bookings.cleaner_id <> dispatch_offers.cleaner_id`):
--     the booking was later reassigned to a different cleaner; the booking's
--     display_earnings_cents now belongs to that other cleaner, NOT to the
--     historical offer recipient. We must not cross-attribute.
--   - Rejected / expired offers: these did not result in earnings, and
--     re-deriving "what the cleaner would have earned" risks using a
--     different value than what the cleaner saw at offer time. The audit
--     query / repair script handles live pending offers; historical
--     non-accepted offers stay null on purpose.
--
-- Safety belt: the `display_earnings_cents IS NULL` filter on the UPDATE
-- means any prior write (e.g. by an earlier repair-script run) is preserved.
-- ---------------------------------------------------------------------------
with backfill_candidates as (
  select
    d.id as offer_id,
    b.display_earnings_cents as src_cents
  from public.dispatch_offers d
  join public.bookings b on b.id = d.booking_id
  where d.status = 'accepted'
    and d.display_earnings_cents is null
    and b.cleaner_id = d.cleaner_id
    and coalesce(b.is_team_job, false) = false
    and b.display_earnings_cents is not null
    and b.display_earnings_cents > 0
)
update public.dispatch_offers d
set
  display_earnings_cents = c.src_cents,
  earnings_snapshot_source = 'm24_backfill_accepted_solo_from_booking',
  earnings_snapshot_at = coalesce(d.earnings_snapshot_at, now())
from backfill_candidates c
where d.id = c.offer_id
  and d.display_earnings_cents is null
  and d.status = 'accepted';

-- ---------------------------------------------------------------------------
-- Step 3 (post-audit): emit residual counts so the deploy log proves the
-- cleanup converged (or shows what could not be fixed safely).
-- ---------------------------------------------------------------------------
do $$
declare
  v_residual_stale_pending bigint;
  v_residual_accepted_solo_no_snapshot bigint;
  v_active_pending_after bigint;
begin
  select count(*) into v_residual_stale_pending
  from public.dispatch_offers d
  where d.status = 'pending'
    and d.expires_at < now();

  select count(*) into v_residual_accepted_solo_no_snapshot
  from public.dispatch_offers d
  join public.bookings b on b.id = d.booking_id
  where d.status = 'accepted'
    and d.display_earnings_cents is null
    and b.cleaner_id = d.cleaner_id
    and coalesce(b.is_team_job, false) = false
    and b.display_earnings_cents is not null
    and b.display_earnings_cents > 0;

  select count(*) into v_active_pending_after
  from public.dispatch_offers d
  where d.status = 'pending'
    and d.expires_at > now();

  raise notice 'M-24 residual: stale_pending=% accepted_solo_no_snapshot=% active_pending_unaffected=%',
    v_residual_stale_pending, v_residual_accepted_solo_no_snapshot, v_active_pending_after;
end $$;
