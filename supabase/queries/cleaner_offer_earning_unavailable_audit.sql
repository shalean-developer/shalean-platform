-- ============================================================================
-- Audit: cleaner offer card showing "Job earning unavailable"
-- ----------------------------------------------------------------------------
-- Purpose
--   Tells you whether the missing-earning condition on cleaner offer cards is
--   isolated (a few stuck bookings) or systemic (a whole flow). Run before
--   and after applying:
--     - migration 20260934_dispatch_offers_earnings_snapshot.sql
--     - apps/web/scripts/repairMissingDispatchOfferEarningsSnapshot.ts
--
-- Scope
--   Looks ONLY at active surfaces the cleaner can see:
--     - pending dispatch offers (`dispatch_offers.status = 'pending'` and
--       `expires_at > now()`)
--     - assigned bookings (`bookings.status = 'assigned'`)
--     - in-progress bookings (`bookings.status = 'in_progress'`)
--   In each case the cleaner sees "Job earning unavailable" iff none of
--   `bookings.cleaner_earnings_total_cents`, `bookings.payout_frozen_cents`,
--   `bookings.display_earnings_cents`, OR `dispatch_offers.display_earnings_cents`
--   resolves to a positive value.
--
-- How to read
--   Section A reports counts & ratios; sections B–E break down by suspected
--   driver. Section F lists rows for spot inspection.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Top-line: open pending offers vs offers missing earnings (snapshot OR
--    persisted booking columns).
-- ----------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE TRUE) AS pending_offers_total,
  count(*) FILTER (
    WHERE coalesce(d.display_earnings_cents, 0) <= 0
      AND coalesce(b.cleaner_earnings_total_cents, 0) <= 0
      AND coalesce(b.payout_frozen_cents, 0) <= 0
      AND coalesce(b.display_earnings_cents, 0) <= 0
  ) AS pending_offers_missing_earning,
  count(*) FILTER (
    WHERE d.display_earnings_cents IS NULL
  ) AS pending_offers_without_snapshot,
  round(
    100.0 * count(*) FILTER (
      WHERE coalesce(d.display_earnings_cents, 0) <= 0
        AND coalesce(b.cleaner_earnings_total_cents, 0) <= 0
        AND coalesce(b.payout_frozen_cents, 0) <= 0
        AND coalesce(b.display_earnings_cents, 0) <= 0
    ) / nullif(count(*), 0),
    2
  ) AS pct_pending_unavailable
FROM public.dispatch_offers d
JOIN public.bookings b ON b.id = d.booking_id
WHERE d.status = 'pending'
  AND d.expires_at > now();

-- ----------------------------------------------------------------------------
-- B. Pending offers missing earnings, grouped by service.
--    Confirms whether a single service catalog (e.g. "standard") is dominating
--    the failures.
-- ----------------------------------------------------------------------------
SELECT
  coalesce(b.service, '(null)') AS service,
  b.is_team_job,
  count(*) AS pending_offers,
  count(*) FILTER (
    WHERE coalesce(d.display_earnings_cents, 0) <= 0
      AND coalesce(b.cleaner_earnings_total_cents, 0) <= 0
      AND coalesce(b.payout_frozen_cents, 0) <= 0
      AND coalesce(b.display_earnings_cents, 0) <= 0
  ) AS missing_earning,
  count(*) FILTER (WHERE d.earnings_snapshot_source IS NOT NULL) AS has_snapshot_source,
  count(*) FILTER (WHERE d.earnings_snapshot_source = 'canonical') AS snapshot_canonical,
  count(*) FILTER (WHERE d.earnings_snapshot_source = 'missing_payment_basis') AS snapshot_missing_basis,
  count(*) FILTER (WHERE d.earnings_snapshot_source = 'missing_appointment_instant') AS snapshot_missing_appt,
  count(*) FILTER (WHERE d.earnings_snapshot_source = 'cleaner_tenure_unknown') AS snapshot_tenure_unknown
FROM public.dispatch_offers d
JOIN public.bookings b ON b.id = d.booking_id
WHERE d.status = 'pending'
  AND d.expires_at > now()
GROUP BY coalesce(b.service, '(null)'), b.is_team_job
ORDER BY missing_earning DESC, pending_offers DESC;

-- ----------------------------------------------------------------------------
-- C. Pending offers missing earnings, grouped by booking flow:
--    backfill / recurring vs prepaid one-time.
-- ----------------------------------------------------------------------------
SELECT
  coalesce(b.is_recurring_generated, FALSE) AS is_recurring_generated,
  coalesce(b.billing_type, '(null)') AS billing_type,
  coalesce(b.assignment_type, '(null)') AS assignment_type,
  count(*) AS pending_offers,
  count(*) FILTER (
    WHERE coalesce(d.display_earnings_cents, 0) <= 0
      AND coalesce(b.cleaner_earnings_total_cents, 0) <= 0
      AND coalesce(b.payout_frozen_cents, 0) <= 0
      AND coalesce(b.display_earnings_cents, 0) <= 0
  ) AS missing_earning
FROM public.dispatch_offers d
JOIN public.bookings b ON b.id = d.booking_id
WHERE d.status = 'pending'
  AND d.expires_at > now()
GROUP BY 1, 2, 3
ORDER BY missing_earning DESC, pending_offers DESC;

-- ----------------------------------------------------------------------------
-- D. Assigned + in_progress bookings missing earnings (post-acceptance gate).
--    Different failure mode from pending offers — these would also block the
--    completion gate. Repair via:
--      cd apps/web && npm run repair:zero-earning-assigned -- --dry-run
-- ----------------------------------------------------------------------------
SELECT
  b.status,
  coalesce(b.service, '(null)') AS service,
  b.is_team_job,
  count(*) AS rows,
  count(*) FILTER (
    WHERE coalesce(b.cleaner_earnings_total_cents, 0) <= 0
      AND coalesce(b.payout_frozen_cents, 0) <= 0
      AND coalesce(b.display_earnings_cents, 0) <= 0
  ) AS missing_earning
FROM public.bookings b
WHERE b.status IN ('assigned', 'in_progress')
GROUP BY b.status, coalesce(b.service, '(null)'), b.is_team_job
ORDER BY missing_earning DESC;

-- ----------------------------------------------------------------------------
-- E. Snapshot adoption ratio over the last 24 h of pending offer creations.
--    After deploying migration 20260934 + the createDispatchOfferRow change,
--    this should approach 100% (modulo the documented snapshot-miss codes).
-- ----------------------------------------------------------------------------
SELECT
  date_trunc('hour', d.created_at) AS hour,
  count(*) AS offers_created,
  count(*) FILTER (WHERE d.display_earnings_cents IS NOT NULL) AS with_snapshot,
  count(*) FILTER (WHERE d.earnings_snapshot_source = 'canonical') AS canonical,
  count(*) FILTER (
    WHERE d.earnings_snapshot_source IS NOT NULL
      AND d.earnings_snapshot_source <> 'canonical'
  ) AS degraded,
  count(*) FILTER (WHERE d.earnings_snapshot_source IS NULL) AS no_snapshot_attempt
FROM public.dispatch_offers d
WHERE d.created_at > now() - interval '24 hours'
GROUP BY 1
ORDER BY 1 DESC;

-- ----------------------------------------------------------------------------
-- F. Spot inspection: 25 most-recent pending offers still missing earnings.
--    Use these UUIDs with the per-booking deep-dive in
--    `cleaner_zero_earning_completion_block_audit.sql`.
-- ----------------------------------------------------------------------------
SELECT
  d.id AS offer_id,
  d.cleaner_id,
  d.created_at,
  d.expires_at,
  d.earnings_snapshot_source,
  b.id AS booking_id,
  b.service,
  b.is_team_job,
  b.is_recurring_generated,
  b.billing_type,
  b.date,
  b.time,
  b.total_paid_zar,
  b.total_paid_cents,
  b.amount_paid_cents,
  b.base_amount_cents,
  b.display_earnings_cents AS booking_display_earnings_cents,
  b.payout_frozen_cents,
  b.cleaner_earnings_total_cents
FROM public.dispatch_offers d
JOIN public.bookings b ON b.id = d.booking_id
WHERE d.status = 'pending'
  AND d.expires_at > now()
  AND coalesce(d.display_earnings_cents, 0) <= 0
  AND coalesce(b.cleaner_earnings_total_cents, 0) <= 0
  AND coalesce(b.payout_frozen_cents, 0) <= 0
  AND coalesce(b.display_earnings_cents, 0) <= 0
ORDER BY d.created_at DESC
LIMIT 25;
