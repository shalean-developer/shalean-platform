-- Phase 11 / 11B / 12 (read-only): payout subsystem convergence probes — booking payout_status / frozen,
-- weekly cleaner_payouts linkage, monthly invoice settlement, completed work, ledger alignment.
-- Spec: docs/payout-authority-lifecycle-phase11b.md
-- Interpret: non-empty = investigate before payout convergence changes.

-- ---------------------------------------------------------------------------
-- P1) Weekly-batch risk: completed, not test, still on cleaner weekly pool (no payout_id),
--     has persisted cleaner payout, but booking is NOT payout-eligible (pending / other).
--     (Phase 12 also excludes many of these in-app via bookingPayableForWeeklyBatch; P1 remains useful for admin UI.)
-- ---------------------------------------------------------------------------
select
  'completed_in_weekly_pool_not_payout_eligible' as probe,
  b.id,
  b.status,
  b.payment_status,
  b.payout_status,
  b.monthly_invoice_id,
  b.billing_type,
  b.cleaner_payout_cents,
  b.payout_id
from public.bookings b
where lower(trim(coalesce(b.status, ''))) = 'completed'
  and coalesce(b.is_test, false) = false
  and b.cleaner_id is not null
  and b.cleaner_payout_cents is not null
  and b.cleaner_payout_cents > 0
  and b.payout_id is null
  and lower(trim(coalesce(b.payout_status, ''))) <> 'eligible'
order by b.completed_at desc nulls last
limit 200;

-- ---------------------------------------------------------------------------
-- P2) Eligible rows (admin mark-paid input) where linked monthly invoice is not paid
--     (same family as monthly settlement invariants; payout-side lens).
-- ---------------------------------------------------------------------------
select
  'eligible_booking_monthly_invoice_not_paid' as probe,
  b.id as booking_id,
  b.payout_status,
  b.monthly_invoice_id,
  mi.status as invoice_status
from public.bookings b
join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
where lower(trim(coalesce(b.payout_status, ''))) = 'eligible'
  and lower(trim(coalesce(mi.status, ''))) <> 'paid'
order by b.updated_at desc nulls last
limit 200;

-- ---------------------------------------------------------------------------
-- P3) DB constraint surface: eligible/paid must have frozen (should always be empty in prod)
-- ---------------------------------------------------------------------------
select
  'eligible_or_paid_missing_frozen' as probe,
  id,
  payout_status,
  payout_frozen_cents
from public.bookings
where payout_status in ('eligible', 'paid')
  and payout_frozen_cents is null
limit 200;

-- ---------------------------------------------------------------------------
-- P4) Paid without ledger integrity (existing daily monitor pattern; repeated for ad-hoc runs)
-- ---------------------------------------------------------------------------
select
  'paid_missing_payout_paid_at' as probe,
  id,
  payout_status,
  payout_paid_at,
  payout_run_id
from public.bookings
where payout_status = 'paid'
  and payout_paid_at is null
limit 100;

-- ---------------------------------------------------------------------------
-- P5) Batched weekly (payout_id set) while line still pending_monthly — settlement
--     truth not aligned with weekly pool membership (high severity if non-empty).
-- ---------------------------------------------------------------------------
select
  'weekly_batch_pending_monthly_payment' as probe,
  b.id as booking_id,
  b.payment_status,
  b.payout_status,
  b.payout_id,
  cp.status as cleaner_payout_status
from public.bookings b
join public.cleaner_payouts cp on cp.id = b.payout_id
where lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
  and b.payout_id is not null
order by b.updated_at desc nulls last
limit 200;

-- ---------------------------------------------------------------------------
-- P6) Booking payout_status paid but ledger row not paid (cleaner_earnings exists)
-- ---------------------------------------------------------------------------
select
  'booking_paid_ledger_not_paid' as probe,
  b.id as booking_id,
  b.payout_status,
  ce.id as cleaner_earnings_id,
  ce.status as cleaner_earnings_status
from public.bookings b
join public.cleaner_earnings ce on ce.booking_id = b.id
where b.payout_status = 'paid'
  and ce.status is distinct from 'paid'
limit 200;

-- ---------------------------------------------------------------------------
-- P7) Ledger paid but booking payout_status not paid (reverse divergence)
-- ---------------------------------------------------------------------------
select
  'ledger_paid_booking_not_paid' as probe,
  b.id as booking_id,
  b.payout_status,
  ce.id as cleaner_earnings_id,
  ce.status as cleaner_earnings_status
from public.cleaner_earnings ce
join public.bookings b on b.id = ce.booking_id
where ce.status = 'paid'
  and lower(trim(coalesce(b.payout_status, ''))) is distinct from 'paid'
limit 200;

-- ---------------------------------------------------------------------------
-- P8) Phase 12 — mirrors apps/web/lib/payout/bookingPayableForWeeklyBatch.ts **except** refund columns:
--     `refunded_at` / `refund_status` (migration 20260806_bookings_refund_tracking.sql) are omitted here so
--     this probe runs on DBs before that migration; the app still applies bookingPaymentRecomputeBlockedByRefund.
--     Rows in the legacy weekly pool (completed + cents + null payout_id) that would NOT pass batching today.
--     Non-empty ⇒ bookings previously batchable under “completed + cents” only.
-- ---------------------------------------------------------------------------
select
  'weekly_pool_fails_phase12_predicate' as probe,
  b.id as booking_id,
  b.cleaner_id,
  b.billing_type,
  b.is_monthly_billing_booking,
  b.monthly_invoice_id,
  b.payment_status,
  b.payout_status,
  b.payout_frozen_cents,
  b.cleaner_payout_cents,
  mi.status as invoice_status
from public.bookings b
left join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
where lower(trim(coalesce(b.status, ''))) = 'completed'
  and coalesce(b.is_test, false) = false
  and b.cleaner_id is not null
  and b.cleaner_payout_cents is not null
  and b.cleaner_payout_cents > 0
  and b.payout_id is null
  and not (
    (
      (
        lower(trim(coalesce(b.billing_type, ''))) in ('recurring_invoice', 'monthly_contract', 'pay_later')
        or coalesce(b.is_monthly_billing_booking, false) = true
        or lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
        or b.monthly_invoice_id is not null
      )
      and b.monthly_invoice_id is not null
      and lower(trim(coalesce(mi.status, ''))) = 'paid'
      and lower(trim(coalesce(b.payment_status, ''))) = 'success'
      and lower(trim(coalesce(b.payout_status, ''))) = 'eligible'
      and b.payout_frozen_cents is not null
    )
    or
    (
      not (
        lower(trim(coalesce(b.billing_type, ''))) in ('recurring_invoice', 'monthly_contract', 'pay_later')
        or coalesce(b.is_monthly_billing_booking, false) = true
        or lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
        or b.monthly_invoice_id is not null
      )
      and lower(trim(coalesce(b.payment_status, ''))) in ('success', 'paid', 'succeeded')
    )
  )
order by b.completed_at desc nulls last
limit 500;

-- ---------------------------------------------------------------------------
-- Phase 15A Week 1 — read-only measurement (no enforcement). See
-- docs/payout-phase15a-measurement-before-enforcement.md
-- ---------------------------------------------------------------------------
-- P9) Ledger rail `paid`/`processing` while booking payout_status is not `eligible`/`paid`
--     (authority gap: money moved or in-flight on ledger vs job payout column).
-- ---------------------------------------------------------------------------
select
  'p15a_ledger_paid_or_processing_booking_payout_not_eligible_paid' as probe,
  ce.id as cleaner_earnings_id,
  ce.booking_id,
  ce.cleaner_id,
  ce.status as cleaner_earnings_status,
  ce.disbursement_id,
  b.payout_status,
  b.payment_status,
  b.payment_state,
  b.payout_id,
  b.billing_type,
  b.monthly_invoice_id
from public.cleaner_earnings ce
join public.bookings b on b.id = ce.booking_id
where ce.status in ('processing', 'paid')
  and lower(trim(coalesce(b.payout_status, ''))) not in ('eligible', 'paid')
order by ce.updated_at desc nulls last
limit 500;

-- ---------------------------------------------------------------------------
-- P9b) Phase 15A — Booking payout column `eligible`/`paid` but `cleaner_earnings` not in the active
--      claim/pay pipeline (`approved` / `processing` / `paid`).
-- ---------------------------------------------------------------------------
select
  'p15a_booking_payout_eligible_or_paid_ledger_not_in_pipeline' as probe,
  ce.id as cleaner_earnings_id,
  ce.booking_id,
  ce.cleaner_id,
  ce.status as cleaner_earnings_status,
  ce.disbursement_id,
  b.payout_status,
  b.payment_status,
  b.payment_state,
  b.payout_id,
  b.billing_type,
  b.monthly_invoice_id
from public.cleaner_earnings ce
join public.bookings b on b.id = ce.booking_id
where lower(trim(coalesce(b.payout_status, ''))) in ('eligible', 'paid')
  and lower(trim(coalesce(ce.status, ''))) not in ('approved', 'processing', 'paid')
order by ce.updated_at desc nulls last
limit 500;

-- ---------------------------------------------------------------------------
-- P9c) Phase 15A — Booking already linked to a weekly batch (`payout_id` set) but ledger row still
--      looks claimable (`approved`, no `disbursement_id`) — batch vs earnings rail drift.
-- ---------------------------------------------------------------------------
select
  'p15a_batched_booking_earnings_still_claimable_shape' as probe,
  ce.id as cleaner_earnings_id,
  ce.booking_id,
  ce.cleaner_id,
  ce.status as cleaner_earnings_status,
  ce.disbursement_id,
  b.payout_status,
  b.payment_status,
  b.payment_state,
  b.payout_id,
  b.billing_type,
  b.monthly_invoice_id
from public.cleaner_earnings ce
join public.bookings b on b.id = ce.booking_id
where b.payout_id is not null
  and lower(trim(coalesce(ce.status, ''))) = 'approved'
  and ce.disbursement_id is null
order by b.updated_at desc nulls last
limit 500;

-- ---------------------------------------------------------------------------
-- P10) Phase 15A — `cleaner_earnings` claimable today (approved, no disbursement_id) whose booking
--      would **not** pass the same Phase 12 weekly predicate as `bookingPayableForWeeklyBatch` (SQL mirror;
--      refund columns omitted like P8 for DBs without migration 20260806).
-- ---------------------------------------------------------------------------
select
  'p15a_claimable_earnings_booking_fails_phase12_authority' as probe,
  ce.id as cleaner_earnings_id,
  ce.booking_id,
  ce.cleaner_id,
  ce.status as cleaner_earnings_status,
  ce.disbursement_id,
  b.status as booking_status,
  b.payment_status,
  b.payment_state,
  b.payout_status,
  b.payout_frozen_cents,
  b.cleaner_payout_cents,
  b.payout_id,
  b.billing_type,
  b.is_monthly_billing_booking,
  b.monthly_invoice_id,
  mi.status as invoice_status
from public.cleaner_earnings ce
join public.bookings b on b.id = ce.booking_id
left join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
where lower(trim(coalesce(ce.status, ''))) = 'approved'
  and ce.disbursement_id is null
  and coalesce(b.is_test, false) = false
  and not (
    lower(trim(coalesce(b.status, ''))) = 'completed'
    and b.cleaner_payout_cents is not null
    and b.cleaner_payout_cents > 0
    and (
      (
        (
          lower(trim(coalesce(b.billing_type, ''))) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false) = true
          or lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        )
        and b.monthly_invoice_id is not null
        and lower(trim(coalesce(mi.status, ''))) = 'paid'
        and lower(trim(coalesce(b.payment_status, ''))) = 'success'
        and lower(trim(coalesce(b.payout_status, ''))) = 'eligible'
        and b.payout_frozen_cents is not null
      )
      or
      (
        not (
          lower(trim(coalesce(b.billing_type, ''))) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false) = true
          or lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        )
        and lower(trim(coalesce(b.payment_status, ''))) in ('success', 'paid', 'succeeded')
      )
    )
  )
order by ce.created_at desc nulls last
limit 500;

-- ---------------------------------------------------------------------------
-- P11) Phase 15A — Weekly batch marked paid + Paystack payment success, but linked booking would **not**
--      pass Phase 12 predicate (historical leak / data drift vs current authority).
-- ---------------------------------------------------------------------------
select
  'p15a_paid_weekly_batch_booking_fails_phase12_authority' as probe,
  b.id as booking_id,
  b.cleaner_id,
  b.payout_id,
  b.payment_status,
  b.payment_state,
  b.payout_status,
  b.payout_frozen_cents,
  b.cleaner_payout_cents,
  b.billing_type,
  b.is_monthly_billing_booking,
  b.monthly_invoice_id,
  cp.id as cleaner_payout_id,
  cp.status as cleaner_payout_status,
  cp.payment_status as cleaner_payout_payment_status,
  mi.status as invoice_status
from public.bookings b
join public.cleaner_payouts cp on cp.id = b.payout_id
left join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
where lower(trim(coalesce(cp.status, ''))) = 'paid'
  and lower(trim(coalesce(cp.payment_status, ''))) = 'success'
  and b.payout_id is not null
  and coalesce(b.is_test, false) = false
  and not (
    lower(trim(coalesce(b.status, ''))) = 'completed'
    and b.cleaner_payout_cents is not null
    and b.cleaner_payout_cents > 0
    and (
      (
        (
          lower(trim(coalesce(b.billing_type, ''))) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false) = true
          or lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        )
        and b.monthly_invoice_id is not null
        and lower(trim(coalesce(mi.status, ''))) = 'paid'
        and lower(trim(coalesce(b.payment_status, ''))) = 'success'
        and lower(trim(coalesce(b.payout_status, ''))) = 'eligible'
        and b.payout_frozen_cents is not null
      )
      or
      (
        not (
          lower(trim(coalesce(b.billing_type, ''))) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false) = true
          or lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        )
        and lower(trim(coalesce(b.payment_status, ''))) in ('success', 'paid', 'succeeded')
      )
    )
  )
order by cp.paid_at desc nulls last
limit 500;

-- ---------------------------------------------------------------------------
-- P11b) Phase 15A — `payout_transfers.status = success` for the weekly batch while the linked booking
--      would **not** pass the Phase 12 predicate (transfer audit vs booking authority).
-- ---------------------------------------------------------------------------
select
  'p15a_payout_transfer_success_booking_fails_phase12_authority' as probe,
  b.id as booking_id,
  b.cleaner_id,
  b.payout_id,
  b.payment_status,
  b.payment_state,
  b.payout_status,
  b.payout_frozen_cents,
  b.cleaner_payout_cents,
  b.billing_type,
  b.is_monthly_billing_booking,
  b.monthly_invoice_id,
  cp.id as cleaner_payout_id,
  cp.status as cleaner_payout_status,
  cp.payment_status as cleaner_payout_payment_status,
  pt.id as payout_transfer_id,
  pt.status as payout_transfer_status,
  mi.status as invoice_status
from public.bookings b
join public.cleaner_payouts cp on cp.id = b.payout_id
join public.payout_transfers pt on pt.payout_id = cp.id
left join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
where lower(trim(coalesce(pt.status, ''))) = 'success'
  and coalesce(b.is_test, false) = false
  and not (
    lower(trim(coalesce(b.status, ''))) = 'completed'
    and b.cleaner_payout_cents is not null
    and b.cleaner_payout_cents > 0
    and (
      (
        (
          lower(trim(coalesce(b.billing_type, ''))) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false) = true
          or lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        )
        and b.monthly_invoice_id is not null
        and lower(trim(coalesce(mi.status, ''))) = 'paid'
        and lower(trim(coalesce(b.payment_status, ''))) = 'success'
        and lower(trim(coalesce(b.payout_status, ''))) = 'eligible'
        and b.payout_frozen_cents is not null
      )
      or
      (
        not (
          lower(trim(coalesce(b.billing_type, ''))) in ('recurring_invoice', 'monthly_contract', 'pay_later')
          or coalesce(b.is_monthly_billing_booking, false) = true
          or lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
          or b.monthly_invoice_id is not null
        )
        and lower(trim(coalesce(b.payment_status, ''))) in ('success', 'paid', 'succeeded')
      )
    )
  )
order by pt.created_at desc nulls last
limit 500;
