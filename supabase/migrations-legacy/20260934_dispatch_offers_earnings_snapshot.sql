-- ============================================================================
-- dispatch_offers: per-(booking, cleaner) earnings snapshot
-- ----------------------------------------------------------------------------
-- Purpose
--   Cleaner offer cards previously rendered "Job earning unavailable" on every
--   solo dispatch offer because the runtime preview helper
--   (`previewDisplayEarningsCentsForCleanerJob`) reused the persist-path
--   eligibility gate, which requires `bookings.cleaner_id =` cleaner. That
--   field is NULL pre-acceptance, so the gate rejected every solo offer and
--   the preview returned null.
--
--   This migration introduces a per-offer earnings snapshot that
--   `createDispatchOfferRow` writes at offer-creation time. The offers route
--   (`/api/cleaner/offers`) reads it before falling back to the runtime
--   preview, so the cleaner sees the canonical amount immediately and the
--   route stops doing N expensive `previewDisplayEarningsCentsForCleanerJob`
--   round-trips per request.
--
--   We persist on `dispatch_offers` rather than `bookings` because solo
--   standard payouts vary by cleaner tenure (60% < 4 months, 70% otherwise),
--   so the same booking can produce different correct amounts when offered
--   to two different cleaners. A per-offer column is the natural shape.
--
-- Columns
--   display_earnings_cents     INTEGER (nullable, ≥ 0)
--   earnings_snapshot_source   TEXT     (nullable; matches OFFER_EARNINGS_SOURCE
--                                        in computeCleanerOfferEarningsSnapshot.ts)
--   earnings_snapshot_at       TIMESTAMPTZ (nullable; when the snapshot was written)
--
-- Safety
--   - All columns are nullable; existing rows are unaffected.
--   - Snapshot writes are best-effort (never block dispatch); a missing
--     snapshot still creates the offer.
--   - Repair script
--     `apps/web/scripts/repairMissingDispatchOfferEarningsSnapshot.ts`
--     backfills open pending offers without touching ledger / payout tables.
-- ============================================================================

ALTER TABLE public.dispatch_offers
  ADD COLUMN IF NOT EXISTS display_earnings_cents INTEGER
    CHECK (display_earnings_cents IS NULL OR display_earnings_cents >= 0);

ALTER TABLE public.dispatch_offers
  ADD COLUMN IF NOT EXISTS earnings_snapshot_source TEXT;

ALTER TABLE public.dispatch_offers
  ADD COLUMN IF NOT EXISTS earnings_snapshot_at TIMESTAMPTZ;

COMMENT ON COLUMN public.dispatch_offers.display_earnings_cents IS
  'Per-(booking, cleaner) cleaner share snapshot in ZAR cents, written at offer creation by createDispatchOfferRow. Read by /api/cleaner/offers before falling back to previewDisplayEarningsCentsForCleanerJob. Never overwritten by snapshot writes once non-null.';
COMMENT ON COLUMN public.dispatch_offers.earnings_snapshot_source IS
  'Stable source code from computeCleanerOfferEarningsSnapshot (canonical | cleaner_tenure_unknown | missing_payment_basis | missing_appointment_instant). Diagnostics only — UI does not branch on this.';
COMMENT ON COLUMN public.dispatch_offers.earnings_snapshot_at IS
  'When the snapshot was written. Null for offers created before this column existed; the repair script backfills these.';

-- Partial index to make the repair script and audit queries cheap.
CREATE INDEX IF NOT EXISTS dispatch_offers_pending_missing_earnings_idx
  ON public.dispatch_offers (booking_id, cleaner_id)
  WHERE status = 'pending' AND display_earnings_cents IS NULL;
