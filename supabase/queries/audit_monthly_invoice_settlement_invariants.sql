-- Phase 10B: read-only invariant probes for monthly invoice settlement vs booking / payout projection.
-- Run in SQL editor or CI diagnostics; empty result sets = no drift for that probe (limits avoid huge scans).

-- ---------------------------------------------------------------------------
-- A) Accounting says paid, but a non-cancelled line still shows pending_monthly
-- ---------------------------------------------------------------------------
select
  'paid_invoice_booking_pending_monthly' as probe,
  b.id as booking_id,
  b.monthly_invoice_id,
  b.payment_status,
  b.payout_status,
  mi.status as invoice_status
from public.bookings b
join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
where lower(trim(coalesce(mi.status, ''))) = 'paid'
  and lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
  and lower(trim(coalesce(b.status, ''))) <> 'cancelled'
order by b.updated_at desc nulls last
limit 200;

-- ---------------------------------------------------------------------------
-- B) Booking shows success on an invoice line, but the invoice is not paid
--    (split-brain: settlement truth vs line-level display)
-- ---------------------------------------------------------------------------
select
  'success_booking_invoice_not_paid' as probe,
  b.id as booking_id,
  b.monthly_invoice_id,
  b.payment_status,
  b.payout_status,
  mi.status as invoice_status,
  mi.amount_paid_cents,
  mi.total_amount_cents
from public.bookings b
join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
where b.monthly_invoice_id is not null
  and lower(trim(coalesce(b.payment_status, ''))) = 'success'
  and lower(trim(coalesce(mi.status, ''))) <> 'paid'
  and lower(trim(coalesce(b.status, ''))) <> 'cancelled'
order by b.updated_at desc nulls last
limit 200;

-- ---------------------------------------------------------------------------
-- C) Monthly-invoice rail: payout eligible while invoice unpaid or line not success
-- ---------------------------------------------------------------------------
select
  'monthly_rail_eligible_without_full_settlement' as probe,
  b.id as booking_id,
  b.monthly_invoice_id,
  b.payment_status,
  b.payout_status,
  mi.status as invoice_status
from public.bookings b
join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
where lower(trim(coalesce(b.payout_status, ''))) = 'eligible'
  and lower(trim(coalesce(b.status, ''))) <> 'cancelled'
  and (
    lower(trim(coalesce(mi.status, ''))) <> 'paid'
    or lower(trim(coalesce(b.payment_status, ''))) <> 'success'
  )
order by b.updated_at desc nulls last
limit 200;

-- ---------------------------------------------------------------------------
-- D) Invoice still partially_paid but a linked booking already shows success
-- ---------------------------------------------------------------------------
select
  'partially_paid_invoice_success_booking' as probe,
  mi.id as invoice_id,
  mi.status as invoice_status,
  mi.amount_paid_cents,
  mi.total_amount_cents,
  b.id as booking_id,
  b.payment_status
from public.monthly_invoices mi
join public.bookings b on b.monthly_invoice_id = mi.id
where lower(trim(coalesce(mi.status, ''))) = 'partially_paid'
  and lower(trim(coalesce(b.payment_status, ''))) = 'success'
  and lower(trim(coalesce(b.status, ''))) <> 'cancelled'
order by mi.updated_at desc nulls last
limit 200;

-- ---------------------------------------------------------------------------
-- E) Recurring-generated monthly lines: paid invoice + success, but payment_state not "charged"
--    (operational projection drift; expect charged when status is not pending_payment)
-- Phase 10D repair (refresh only): apps/web/lib/monthlyInvoice/repairMonthlyInvoicePaymentStateDriftProbeE.ts
--   Cron: POST /api/cron/repair-monthly-payment-state-drift (`verifyCronSecret`: Bearer or x-cron-secret)
--   Admin: POST /api/admin/invoices/repair-payment-state-drift (Bearer admin session)
-- ---------------------------------------------------------------------------
select
  'recurring_monthly_payment_state_drift' as probe,
  b.id as booking_id,
  b.status as booking_status,
  b.payment_status,
  b.payment_state,
  coalesce(b.is_recurring_generated, false) as is_recurring_generated
from public.bookings b
join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
where lower(trim(coalesce(mi.status, ''))) = 'paid'
  and coalesce(b.is_recurring_generated, false)
  and lower(trim(coalesce(b.payment_status, ''))) = 'success'
  and lower(trim(coalesce(b.status, ''))) <> 'cancelled'
  and lower(trim(coalesce(b.status, ''))) <> 'pending_payment'
  and coalesce(lower(trim(b.payment_state)), '') <> 'charged'
order by b.updated_at desc nulls last
limit 200;
