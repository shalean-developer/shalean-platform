-- ============================================================================
-- bookings.payment_method: allow {cash, zoho, eft, card}
-- ----------------------------------------------------------------------------
-- Production Readiness Audit C-1.
--
-- Symptom before this migration
--   Admin "Mark paid (EFT)" surfaces an opaque 500 because:
--     `apps/web/lib/booking/adminMarkBookingPaid.ts:299` writes
--     `payment_method: 'eft'`, but the active CHECK constraint
--     `bookings_payment_method_chk` only accepts {cash, zoho}:
--
--       CHECK (payment_method IS NULL
--              OR payment_method = ANY (ARRAY['cash','zoho']))
--
--     Postgres returns 23514 and `adminMarkBookingPaid` returns httpStatus 500
--     to the admin UI. Cleaners are not paid for EFT-settled bookings.
--
-- Scope
--   Idempotent re-create of `bookings_payment_method_chk` to accept
--     {cash, zoho, eft, card}.
--   * `eft`  — already written by `adminMarkBookingPaid.ts:299`
--               and the admin route at
--               `apps/web/app/api/admin/bookings/[id]/mark-paid/route.ts:57-59`.
--   * `card` — additional value the audit recommends so that future Paystack
--               write paths (e.g. card-receipt reconciliation) do not trip
--               the same constraint. No app code writes `'card'` today
--               (verified by repo grep on `payment_method:` and
--               `payment_method =`); this migration is purely defensive.
--
-- What this migration does NOT do
--   * It does NOT change `AdminMarkPaidMethod` ("cash" | "zoho" | "eft").
--   * It does NOT change any business logic, payout calculations, or
--     side-effects of `adminMarkBookingPaid`.
--   * It does NOT widen the admin route's accepted method list.
--
-- Safety
--   Idempotent. `drop constraint if exists` then `add constraint`. Safe to
--   re-run. Existing rows already satisfy the new (looser) CHECK because
--   {cash, zoho} ⊂ {cash, zoho, eft, card}.
-- ============================================================================

alter table public.bookings drop constraint if exists bookings_payment_method_chk;

alter table public.bookings
  add constraint bookings_payment_method_chk
  check (payment_method is null or payment_method in ('cash', 'zoho', 'eft', 'card'));

comment on constraint bookings_payment_method_chk on public.bookings is
  'Allowed off-platform settlement methods. Paystack uses paystack_reference + payment_status=success rather than this column. Extended in 20260936 to include eft and card.';
