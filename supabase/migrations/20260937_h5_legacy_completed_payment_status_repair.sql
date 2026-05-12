-- ============================================================================
-- H-5 historical repair — completed bookings drifted off `payment_status='success'`
-- ----------------------------------------------------------------------------
-- Production Readiness Audit H-5.
--
-- Symptom
--   `apps/web/lib/payout/bookingPayableForWeeklyBatch.ts` (the prepaid rail)
--   requires `payment_status ∈ {success, paid, succeeded}` to admit a
--   completed booking into a weekly cleaner_payouts batch. Legacy rows with
--   `payment_status IS NULL` but otherwise valid payment evidence are
--   silently excluded from cleaner payouts even though the cleaner did the
--   work and the customer paid.
--
-- Live evidence at the time of writing
--   4 completed prepaid rows have `payment_status IS NULL`. 3 of them have
--   strong, multi-signal payment evidence (positive `amount_paid_cents`
--   plus another independent signal); 1 has `cleaner_payout_cents = 0`
--   and is not a payout candidate regardless of payment_status.
--
-- Forward-fix history (do NOT re-touch these paths)
--   * `20260913_bookings_payment_status_repair.sql` — canonicalises blank /
--     casing / synonym values to `'success'` only when payment evidence
--     exists. It does NOT touch rows where `payment_status IS NULL`.
--   * Paystack finalize (`upsertBookingFromPaystack`) and admin mark-paid
--     (`adminMarkBookingPaid`) write `payment_status = 'success'` directly
--     for new rows, so this drift is bounded to historical pre-fix data.
--
-- Repair criteria (all must hold)
--   1.  status = 'completed'
--   2.  payment_status IS NULL                     -- only NULL → 'success';
--                                                     legitimate states
--                                                     ('pending', 'failed',
--                                                     'pending_monthly') are
--                                                     never overwritten.
--   3.  cleaner_payout_cents > 0                   -- payable basis exists.
--   4.  is_test = false / null                     -- no fixture rows.
--   5.  Not a monthly invoice path:
--         - is_monthly_billing_booking = false
--         - monthly_invoice_id IS NULL
--         - billing_type ∉ {recurring_invoice, monthly_contract}
--   6.  Not refunded / reversed:
--         - refunded_at IS NULL
--         - refund_status not in
--             (refunded, full, partial, chargeback, reversed,
--              failed_after_success)
--   7.  amount_paid_cents > 0                      -- mandatory anchor;
--                                                     also satisfies
--                                                     `bookings_paid_requires_amount`.
--   8.  ≥ 1 *additional* independent payment-evidence signal from:
--         - payment_completed_at IS NOT NULL
--         - paid_at IS NOT NULL
--         - total_paid_cents > 0
--         - total_paid_zar > 0
--         - paystack_reference is non-empty
--         - marked_paid_by_admin_id IS NOT NULL
--       (defence-in-depth: any one column could be a lone-write artifact,
--       so the repair refuses to act on a single signal.)
--
-- Constraint compatibility
--   * `bookings_paid_requires_amount` (NOT VALID): satisfied by criterion 7.
--   * `bookings_paid_requires_timestamp`: setting payment_status='success'
--     requires payment_completed_at IS NOT NULL. We coalesce
--       payment_completed_at, paid_at, completed_at
--     in that order so the constraint always holds. completed_at is a
--     legitimate "no earlier than" upper bound for the payment moment on
--     a completed booking; the repair never invents a timestamp.
--   * `bookings_paid_not_pending_payment`: satisfied — status='completed'.
--   * `bookings_payment_status_check`: 'success' is in the allowed enum.
--   * `trg_bookings_lock_finalized_invoice`: short-circuits on
--     monthly_invoice_id IS NULL → no interference (criterion 5).
--
-- Idempotency
--   The WHERE clause includes `payment_status IS NULL`, so re-running this
--   migration is a no-op once the rows are healed. Safe to deploy multiple
--   times.
--
-- Out-of-scope (per H-5 audit instruction "isolated to H-5 historical repair")
--   * No payout formula changes.
--   * No weekly batching logic changes.
--   * No payment invariants weakened (no constraints loosened).
--   * Monthly invoice rows are NEVER touched by this repair.
-- ============================================================================

with h5_repair_candidates as (
  select id,
         coalesce(payment_completed_at, paid_at, completed_at) as new_payment_completed_at
  from public.bookings
  where status = 'completed'
    and payment_status is null
    and coalesce(cleaner_payout_cents, 0) > 0
    and coalesce(is_test, false) = false
    and coalesce(is_monthly_billing_booking, false) = false
    and monthly_invoice_id is null
    and lower(coalesce(billing_type::text, '')) not in ('recurring_invoice', 'monthly_contract')
    and refunded_at is null
    and (
      refund_status is null
      or lower(btrim(refund_status)) not in (
        'refunded', 'full', 'partial', 'chargeback', 'reversed', 'failed_after_success'
      )
    )
    and coalesce(amount_paid_cents, 0) > 0
    -- ≥ 1 additional independent evidence signal beyond amount_paid_cents
    and (
      ((case when payment_completed_at is not null then 1 else 0 end) +
       (case when paid_at is not null then 1 else 0 end) +
       (case when coalesce(total_paid_cents, 0) > 0 then 1 else 0 end) +
       (case when coalesce(total_paid_zar, 0) > 0 then 1 else 0 end) +
       (case when paystack_reference is not null
                  and length(btrim(paystack_reference)) > 0 then 1 else 0 end) +
       (case when marked_paid_by_admin_id is not null then 1 else 0 end))
      >= 1
    )
    -- The synthetic timestamp must exist; abort silently if all three are null.
    and coalesce(payment_completed_at, paid_at, completed_at) is not null
)
update public.bookings b
set
  payment_status = 'success',
  payment_completed_at = c.new_payment_completed_at,
  updated_at = now()
from h5_repair_candidates c
where b.id = c.id;
