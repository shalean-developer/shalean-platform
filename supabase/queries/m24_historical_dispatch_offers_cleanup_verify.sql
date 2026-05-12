-- ============================================================================
-- M-24: verification queries for historical dispatch_offers cleanup
-- ----------------------------------------------------------------------------
-- Run BEFORE applying `20260946_m24_historical_dispatch_offers_cleanup.sql`
-- to size the cleanup, and AFTER to confirm convergence.
--
-- All queries are read-only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Top-line: stale pending offers (the population the migration expires).
--    AFTER the migration this MUST be 0.
-- ----------------------------------------------------------------------------
SELECT
  count(*) AS stale_pending_total,
  count(*) FILTER (WHERE expires_at < now() - interval '1 day')  AS stale_more_than_1d,
  count(*) FILTER (WHERE expires_at < now() - interval '7 days') AS stale_more_than_7d,
  count(*) FILTER (WHERE expires_at < now() - interval '30 days') AS stale_more_than_30d
FROM public.dispatch_offers
WHERE status = 'pending'
  AND expires_at < now();

-- ----------------------------------------------------------------------------
-- B. Active / future pending offers — these MUST NOT change pre/post migration.
--    Run before, then run again after; both counts should be identical.
-- ----------------------------------------------------------------------------
SELECT
  count(*) AS active_pending_total,
  count(*) FILTER (WHERE display_earnings_cents IS NOT NULL) AS with_snapshot,
  count(*) FILTER (WHERE display_earnings_cents IS NULL)     AS without_snapshot
FROM public.dispatch_offers
WHERE status = 'pending'
  AND expires_at > now();

-- ----------------------------------------------------------------------------
-- C. Accepted-solo offers without snapshot but WITH safely derivable booking
--    state — the backfill population. AFTER the migration this MUST be 0.
-- ----------------------------------------------------------------------------
SELECT count(*) AS accepted_solo_no_snapshot_with_safe_source
FROM public.dispatch_offers d
JOIN public.bookings b ON b.id = d.booking_id
WHERE d.status = 'accepted'
  AND d.display_earnings_cents IS NULL
  AND b.cleaner_id = d.cleaner_id
  AND coalesce(b.is_team_job, FALSE) = FALSE
  AND b.display_earnings_cents IS NOT NULL
  AND b.display_earnings_cents > 0;

-- ----------------------------------------------------------------------------
-- D. Accepted offers without snapshot that are intentionally LEFT NULL
--    (team jobs, cleaner-mismatched reassignments, missing booking earnings).
--    These rows are diagnostic-only and require manual review if ever needed.
-- ----------------------------------------------------------------------------
SELECT
  count(*) AS accepted_no_snapshot_unsafe_total,
  count(*) FILTER (WHERE coalesce(b.is_team_job, FALSE) = TRUE)
    AS reason_team_job,
  count(*) FILTER (
    WHERE coalesce(b.is_team_job, FALSE) = FALSE
      AND b.cleaner_id IS DISTINCT FROM d.cleaner_id
  ) AS reason_cleaner_mismatch_or_null,
  count(*) FILTER (
    WHERE coalesce(b.is_team_job, FALSE) = FALSE
      AND b.cleaner_id = d.cleaner_id
      AND coalesce(b.display_earnings_cents, 0) <= 0
  ) AS reason_booking_earnings_missing_or_zero
FROM public.dispatch_offers d
JOIN public.bookings b ON b.id = d.booking_id
WHERE d.status = 'accepted'
  AND d.display_earnings_cents IS NULL;

-- ----------------------------------------------------------------------------
-- E. Stamp evidence: rows the M-24 migration touched are tagged with
--    `earnings_snapshot_source = 'm24_backfill_accepted_solo_from_booking'`.
--    Useful for rollback / replay analysis.
-- ----------------------------------------------------------------------------
SELECT
  count(*)                                                              AS m24_backfilled_total,
  min(earnings_snapshot_at)                                             AS first_backfill_at,
  max(earnings_snapshot_at)                                             AS last_backfill_at,
  round(avg(display_earnings_cents) / 100.0, 2)                         AS avg_zar
FROM public.dispatch_offers
WHERE earnings_snapshot_source = 'm24_backfill_accepted_solo_from_booking';

-- ----------------------------------------------------------------------------
-- F. Spot inspection: 25 most-recent rows the migration expired. Confirms
--    `responded_at = expires_at` (historical-accurate, NOT now()).
-- ----------------------------------------------------------------------------
SELECT
  d.id,
  d.booking_id,
  d.cleaner_id,
  d.expires_at,
  d.responded_at,
  d.responded_at = d.expires_at AS responded_at_matches_expires_at
FROM public.dispatch_offers d
WHERE d.status = 'expired'
  AND d.expires_at < now() - interval '1 hour'
ORDER BY d.expires_at DESC
LIMIT 25;

-- ----------------------------------------------------------------------------
-- G. Active pending offers must remain untouched: their snapshot/source/at
--    columns should never reference `m24_backfill_*`. AFTER must return 0.
-- ----------------------------------------------------------------------------
SELECT count(*) AS active_pending_touched_by_m24_must_be_zero
FROM public.dispatch_offers
WHERE status = 'pending'
  AND expires_at > now()
  AND earnings_snapshot_source = 'm24_backfill_accepted_solo_from_booking';
