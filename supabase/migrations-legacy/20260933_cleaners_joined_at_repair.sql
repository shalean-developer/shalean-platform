-- Repair: add the missing `public.cleaners.joined_at` column.
--
-- Why this exists:
--   Multiple call sites read `cleaners.joined_at` as the canonical tenure anchor for the
--   cleaner payout calculator (see persistCleanerPayout, computeBookingEarnings,
--   tenureBasedCleanerLineShare; and migration 20260846 already used
--   COALESCE(c.joined_at, c.created_at) — proving the column was assumed-present).
--   The CREATE migration was never authored, so every solo cleaner job persist failed
--   with `column cleaners.joined_at does not exist`, leaving `bookings.display_earnings_cents`
--   NULL and blocking job completion.
--
-- Behaviour:
--   - Adds the column idempotently (safe to re-run).
--   - Backfills `joined_at = created_at` for any existing row missing it, so the canonical
--     tenure anchor matches the COALESCE semantics that already exist in code/SQL.
--   - Leaves the column nullable: app code uses `joined_at ?? created_at`, so nulls remain
--     valid; explicit values (e.g. an admin recording a real onboarding date) take precedence.
--   - Adds a comment so future schema audits can see the contract.
--
-- After this migration:
--   `npm run repair:zero-earning-assigned` will recompute `display_earnings_cents` for the
--   ~89 stuck assigned/in_progress bookings via the canonical persistCleanerPayoutIfUnset path.

alter table public.cleaners
  add column if not exists joined_at timestamptz;

update public.cleaners
set joined_at = created_at
where joined_at is null;

comment on column public.cleaners.joined_at is
  'Tenure anchor for canonical cleaner payout. App code reads (joined_at ?? created_at) in persistCleanerPayout, computeBookingEarnings, tenureBasedCleanerLineShare. Required before persistCleanerPayoutIfUnset can populate bookings.display_earnings_cents.';
