# Princess PR D — Refund Status Compatibility Hotfix

**Ticket:** PRINCESS-UAT-PRD-STATUS-HOTFIX  
**Branch:** `fix/princess-prd-refund-status-compatibility`  
**Target:** `staging` only  
**Staging Supabase:** `gbgnemlpyykyhpqqbgru`  
**Base staging merge:** `77ac95b62f0538bef80c658c3987cf66172329cc`  
**Date:** 2026-07-16

---

## Executive Decision

**MODEL A — immutable capture `payment_status`.**

Full refunds must **not** write `payment_status = 'refunded'`. The governed
`bookings_payment_status_check` allows only `pending | success | failed | pending_monthly`.
Refund presentation is derived from `refund_status`, `refunded_at`, and refund
ledger totals. No database migration. Production untouched.

---

## Existing Payment Status Contract

| Layer | Contract |
|-------|----------|
| DB CHECK `bookings_payment_status_check` | `NULL \| pending \| success \| failed \| pending_monthly` |
| Capture writers | settle / Paystack finalize → `success` |
| Refund columns | `refund_status` free-text (`partial \| full \| chargeback \| …`), `refunded_at` |
| Ledger | Immutable capture row + separate `settlement_status=reversed` refund rows |
| Invoice / sales-document | Own `status='refunded'` domain — **not** bookings CHECK |

Source: `supabase/migrations/20260714010000_production_baseline.sql` (bookings CHECK).

---

## Refund State Model

| Dimension | Original capture | Partial refund | Full refund |
|-----------|------------------|----------------|-------------|
| `payment_status` | `success` | **`success` (unchanged)** | **`success` (unchanged)** |
| `refund_status` | `null` | `partial` | `full` |
| `refunded_at` | `null` | set | set |
| Paid columns | capture cents | remaining net | capture audit kept |
| Customer label | Paid | Partially refunded | Fully refunded |
| Admin label | Paid / lifecycle | Partially refunded | Fully refunded |
| Ledger | 1 capture | + N reversed lines | + final reverse; net zero |
| Booking `status` | unchanged | unchanged | **not** auto-cancelled |
| Invoice | N/A (prepaid booking path) | N/A | N/A |

---

## Model Selection

| | MODEL A (selected) | MODEL B (rejected for hotfix) |
|--|--------------------|-------------------------------|
| Change | Stop writing illegal `refunded` | Widen CHECK + migrate |
| Migration | **None** | Required (staging + later prod auth) |
| UI | Already keys off `refund_status` | Works either way |
| Risk | Low — matches partial-refund path | Broader financial domain change |

**Prefer MODEL A** unless product governance later requires `payment_status` itself
to mean “not paid anymore.” That would be a **separate migration authorization**.

---

## Root Cause

1. `paymentStatusForAggregate("full"|"chargeback")` returned `"refunded"`.
2. `markRefundSucceeded` / `markBookingChargeback` persisted that value.
3. Staging Postgres rejected the update via `bookings_payment_status_check`.
4. Partial refunds already succeeded by keeping `payment_status='success'` and
   setting `refund_status='partial'`.

Evidence: `docs/audits/uat/princess/evidence/prd-hotfix-full-refund-constraint-2026-07-16.json`.

---

## Code Fix

| File | Change |
|------|--------|
| `refundStateMachine.ts` | `paymentStatusForAggregate` never returns `refunded`; documents governed domain |
| `refundBookingPayment.ts` | Full/partial succeed **omit** `payment_status` from patch; chargeback omits it |
| `customerPaymentDisplay.ts` | Already derived from `refund_status` (tests updated for MODEL A) |
| `booking-card.tsx` | Refund labels from `refund_status` — no Paid-only contradiction |
| `BookingDetailsView.tsx` | Admin payment label prefers refund-derived Fully/Partially refunded |
| `phase1JHighRiskBookingsWriters.test.ts` | Removed stale writer classification (refund no longer writes `payment_status`) |
| Staging retest harness | Asserts `payment_status === 'success'` + badge Fully refunded |

**No migration added.**

---

## Reconciliation

| Case | Expected |
|------|----------|
| A — R1,000 + R250 | `payment_status=success`, refunded R250, remaining R750, Partially refunded |
| B — + R300 | Cumulative R550, remaining R450, 2 ledger lines |
| C — Full R1,000 | Capture immutable, reversed nets to zero, Fully refunded, booking not cancelled |
| D — R1,001 | Rejected, no state change |

---

## Webhook Compatibility

`refund.processed` / `charge.refunded` / pending / failed share
`applyBookingRefundProviderUpdate` → `markRefundSucceeded` (same MODEL A patch).
Dispute → `markBookingChargeback` (no `payment_status` write).
Duplicate processed events remain idempotent via refund record / ledger reference.

---

## Tests

Local validation (this hotfix):

| Gate | Result |
|------|--------|
| Targeted PR D + customer badge tests | PASS |
| `test:critical` | PASS |
| Full Vitest | PASS (after Phase 1J stale-entry removal) |
| `typecheck` | PASS |
| `lint:booking-core` | PASS |
| `db:migrations:validate` | PASS (no new migration) |
| `next build --webpack` | PASS |

---

## Staging Retest

**After merge into staging**, run:

```bash
node scripts/env/princess-prd-hotfix-staging-retest.mjs
```

Verify:

1. Full refund simulation succeeds (no CHECK failure)
2. `payment_status` remains `success`
3. Capture ledger immutable; refund ledger nets correctly
4. Customer Fully refunded; admin refund status correct
5. Booking not auto-cancelled
6. Maker-checker / partial / cumulative / over-refund still pass
7. Production unmarked; no real Paystack refund

---

## Production Non-Impact

- No production deploy / promote
- No production migration
- No real Paystack refund
- Staging-only marker data in retest harness

---

## Remaining Production-Hardening Gaps

Keep open (unchanged by this hotfix):

- Database-level lock for simultaneous refund claims
- Webhook refund amount cross-check against approved proposal
- Zoho credit-note integration

---

## PR D Closure Decision

**Local / review gate:** MODEL A implemented; schema-compatible; tests green.

**Staging closure:** pending merge + `princess-prd-hotfix-staging-retest.mjs` PASS.

Do **not** start PR E until staging retest closes full-refund + badge + ledger cases.
