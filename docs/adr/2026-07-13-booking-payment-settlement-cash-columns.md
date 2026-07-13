# ADR: Booking payment settlement vs collected-cash columns

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-13 |
| **Findings** | BK-001, BK-002, BK-003 |
| **Branch** | `fix/bk-001-confirm-cash-columns-before-payment` |

## Problem

Booking V2 confirm wrote the payable amount into `amount_paid_cents` / `total_paid_*` while the booking remained `pending_payment`. Downstream readers treated positive cash columns as proof of payment, suppressing recovery and corrupting revenue semantics.

Separately, R0 (fully covered) settlement set `payment_status=success` with zero cash against a constraint requiring `amount_paid_cents > 0`, and ignored update errors. Admin equipment edits rewrote cash columns when changing fees.

## Decision

1. **`payment_status` is the authoritative booking settlement state.**
2. **`amount_paid_cents` (and aligned `total_paid_*`) represent collected cash only.**
3. **Payable / expected amounts live in `total_price` and `price_snapshot` (e.g. `pay_total_zar`).**
4. **Pending payment bookings must have zero collected-cash values.**
5. **Only successful settlement paths may write collected-cash values** (Paystack finalize, admin mark-paid, R0 covered settlement).
6. **R0 policy:** `payment_status=success` with `amount_paid_cents=0` is allowed only when `payment_completed_at` is set and `payment_transaction_id` links a `payment_transactions` row with `payment_channel=promo_credit_cover`, `gateway=other`, `gateway_reference=r0:{bookingId}`, and `amount_cents=0`. Enforced by `booking_zero_cash_success_is_r0`. Never invent a fake one-cent collection.
7. **Historical paid cash is immutable** except via approved refund / adjustment / reconciliation workflows (equipment edits preserve cash and may set `payment_mismatch`).

Canonical helper: `apps/web/lib/booking/bookingPaymentSettlementState.ts` (`bookingIsCustomerPaymentSettled`).

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Fake `amount_paid_cents=1` for R0 | Invents cash that was not collected |
| Keep writing payable into cash columns; fix only readers | Leaves SoT polluted; reporting remains wrong |
| Broad payment-state redesign | Out of scope; violates “no parallel payment system” |

## Compatibility

- Payment-session continues to use `trustedBookingPayableZar` (`total_price` / snapshot).
- Confirm response still returns `payAmountZar`.
- Historical rows without `payment_status` but with cash after leaving `pending_payment` remain settled via the compatibility branch in `bookingIsCustomerPaymentSettled`.
- Positive cents on `pending_payment` are anomalies, not settlement.

## Migration

Forward migration `20261076_bookings_r0_paid_amount_constraint.sql`:

- Narrows `bookings_paid_requires_amount` to allow zero cash when linked R0 ledger exists.
- Adds `settle_booking_fully_covered(uuid)` for atomic R0 settle.

Data correction: dry-run script `apps/web/scripts/repairPendingCollectedCashAnomaly.ts` (not auto-run in production).

## Consequences and monitoring

- Unpaid rows no longer appear paid to recovery / earnings gates.
- Structured events: `r0_settlement_*`, `r0_ledger_booking_mismatch`, `admin_paid_booking_price_change`, `pending_collected_cash_anomaly`.
- Monitor count of `pending_payment AND amount_paid_cents > 0` after deploy.
