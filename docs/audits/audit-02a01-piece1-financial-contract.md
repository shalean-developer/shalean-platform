# AUDIT-02A01 Piece 1 — Financial Source-of-Truth Contract

## Status

Authoritative contract for Stage 02 Piece 1. This piece does not change monthly repricing, invoice finalization, cleaner assignment, roster propagation, payout calculation, or production data.

## Root problem proved by audit

The platform historically overloaded booking financial columns across billing modes. In particular, `total_paid_zar` has been used both as a collected-cash mirror and, on monthly generated bookings, an amount-to-invoice compatibility field.

The forward contract separates five concepts:

1. service value / payable;
2. collected cash;
3. booking settlement state;
4. monthly invoice obligation state;
5. cleaner earnings basis.

## Canonical contract

| Concept | Forward source of truth | Compatibility / fallback | Forbidden interpretation |
|---|---|---|---|
| Booking service value | Eligible canonical `booking_line_items`; if unavailable, `total_price` / immutable price snapshot | historical snapshots | collected-cash columns are not payable truth |
| Collected cash | `amount_paid_cents` | `total_paid_cents`, `total_paid_zar` as mirrors only | positive `total_paid_zar` alone must not prove settlement |
| Checkout settlement | settled `payment_status` + payment ledger/timestamps | bounded legacy evidence outside pending states | pending/expired cash mirrors do not settle a booking |
| Monthly obligation | `monthly_invoices.status` + monthly payment ledger | `payment_status='pending_monthly'` identifies billing-managed child only | `pending_monthly` does not mean cash collected |
| Cleaner earnings basis | eligible canonical line-item subtotal | canonical service value fallback | stale line items may not override repriced service value |

## State rules

### Ordinary checkout — unsettled

- payable lives in `total_price` / price snapshot;
- collected cash is zero;
- positive legacy mirrors are anomaly evidence, not settlement evidence.

### Ordinary checkout — settled

- settled payment state and payment evidence establish settlement;
- `amount_paid_cents` is the collected-cash source;
- `total_paid_cents` / `total_paid_zar` are compatibility mirrors.

### R0 / cleaning-credit covered

- settlement may be successful with zero collected cash only when R0 evidence is complete;
- `payment_completed_at` must be present;
- the caller must verify that the linked payment transaction is the qualifying zero-amount `promo_credit_cover` ledger row;
- zero cash or `payment_status=success` alone must never classify a booking as R0;
- service value and customer settlement are separate concepts.

### Monthly draft

- `pending_monthly` means billing-managed/deferred;
- invoice `draft` state owns mutability of the obligation;
- no cash is collected merely because a child has positive service value;
- historical use of `total_paid_zar` as monthly payable is compatibility-only and must be removed from forward logic in Piece 2.

### Monthly sent / paid

- invoice state, snapshots, gateway/ledger state and settlement evidence own mutability;
- booking repricing must not cross the finalization boundary.

## Invariants required by later pieces

- repriced monthly booking service value equals canonical line-item subtotal;
- monthly invoice rollup consumes that same value;
- cleaner earnings consume that same value;
- collected cash remains independent;
- finalization and repricing are mutually exclusive;
- cleaner/roster changes never silently rewrite booking lifecycle;
- already-applied migrations remain immutable.

## Executable source of truth

- `apps/web/lib/booking/bookingFinancialContract.ts`
- `apps/web/lib/booking/__tests__/bookingFinancialContract.test.ts`

## Explicitly deferred

Piece 1 does not change:
- monthly booking writes;
- historical `total_paid_zar` data;
- invoice recomputation;
- recurring propagation;
- cleaner payout logic;
- database schema.

Those changes belong to later pieces and must each pass their own audit → regression → staging → production gate.
