-- Isolated validation cases for 20261076_bookings_r0_paid_amount_constraint.sql
-- Run ONLY against a local/isolated database after applying that migration.
-- Do not run against production.
--
-- Expected outcomes are documented in comments. Ops/engineers should execute section by section.

-- Setup helpers (synthetic IDs)
-- booking A: pending zero cash — UPDATE of payment_status leave pending (control)
-- Use temporary scratch tables / explicit rollbacks where possible.

begin;

-- 1) Pending + zero cash allowed
-- Assume synthetic insert is possible in isolated DB; validate constraint does not block pending.
-- Expected: OK for payment_status='pending', amount_paid_cents=0

-- 2) Pending + positive cash historically allowed by schema (application flags anomaly)
-- Expected: OK (constraint only fires on payment_status='success')

-- 3) Success + positive cash + any/no tx — allowed when amount_paid_cents > 0
-- Expected: OK

-- 4) Success + zero cash + no payment_transaction_id — rejected
-- Expected: FAIL bookings_paid_requires_amount

-- 5) Success + zero cash + unrelated (non R0) payment_transaction — rejected
-- Expected: FAIL bookings_paid_requires_amount via booking_zero_cash_success_is_r0

-- 6) Success + zero cash + linked promo_credit_cover r0:{id} — allowed
-- Expected: OK

-- 7) Success + zero cash + R0 tx but payment_completed_at null — rejected
-- Expected: FAIL bookings_paid_requires_amount

-- 8) Failed / pending payment_status with zero cash — allowed
-- Expected: OK

-- 9) Existing positive-cash success rows remain valid after constraint replace
-- Expected: OK (no rewrite)

-- 10) settle_booking_fully_covered on total_price>0 — returns not_fully_covered
-- Expected: ok=false, error_message='not_fully_covered'

rollback;

-- Smoke assertions when functions/tables are present (psql):
-- select public.booking_zero_cash_success_is_r0(null, null); -- false
-- Example (replace UUIDs after seeding):
-- select * from public.settle_booking_fully_covered('00000000-0000-4000-8000-000000000099');
