# Phase R1 Verification Report — Cash SoT Integrity (BK-001 / BK-002 / BK-003)

| Field | Value |
|-------|-------|
| **Date** | 2026-07-14 |
| **Branch** | `fix/p2-r1-cash-sot-integrity` |
| **Baseline** | `main` @ `45ccd98f28c892d4598a253e1386f7dfec84f1e5` |
| **Phase A source commit (cherry-picked)** | `10eceaf3a4248c5f1eea6c95339946846ca6c58d` |
| **Scope** | R1 only — cash collected SoT integrity |
| **Merged to main** | No |
| **Deployed** | No |

---

## Pre-implementation baseline (recorded)

| Item | Value |
|------|-------|
| Current branch | `main` |
| HEAD SHA | `45ccd98f28c892d4598a253e1386f7dfec84f1e5` |
| Working tree | Dirty only with untracked `docs/audits/phase-2-end-to-end-workflow-audit/` |
| Phase A commit cherry-picked | `10eceaf3a4248c5f1eea6c95339946846ca6c58d` (`fix(booking): restore collected-cash settlement integrity`) |

---

## Method

1. Created `fix/p2-r1-cash-sot-integrity` from `45ccd98f`.
2. Cherry-picked Phase A commit only (did not merge entire Phase A branch).
3. Adapted migration filename to active governance (`^\d{14}_…\.sql$`):  
   `20261076_…` → `20260714140000_bookings_r0_paid_amount_constraint.sql`.
4. Added regression coverage for successful R0 fallback paid-state transition.
5. Did **not** implement R2+ scope (credits/promos timing, ops reject, RBAC, marketing, payout hard gates, partial-refund ZAR).

---

## Files changed (vs `origin/main`)

### Application / lib

| Path | Role |
|------|------|
| `apps/web/app/api/booking-v2/confirm/route.ts` | BK-001: unpaid confirm writes `bookingUncollectedCashColumns()`; R0 via hardened settle helper |
| `apps/web/app/api/admin/bookings/[id]/equipment/route.ts` | BK-003: uses paid-safe equipment patch builder |
| `apps/web/lib/booking/bookingPaidAmountColumns.ts` | Collected-cash helpers + explicit zero patch |
| `apps/web/lib/booking/bookingPaymentSettlementState.ts` | Canonical settlement detector |
| `apps/web/lib/booking/adminEquipmentFeeUpdate.ts` | Preserve historical paid cash; adjust payable only |
| `apps/web/lib/booking/pendingCollectedCashAnomalyRepair.ts` | Anomaly repair helpers |
| `apps/web/lib/booking/adminEditBookingDetails.ts` | Align cash preservation semantics |
| `apps/web/lib/booking/paymentRecoveryEmailGuards.ts` | Recovery guards use settlement SoT |
| `apps/web/lib/booking/quote/bookingQuotePersistence.ts` | Quote persist does not write cash columns |
| `apps/web/lib/payments/settleFullyCoveredBooking.ts` | BK-002: RPC-first R0 settle; error-checked fallback; no silent success |
| `apps/web/lib/payments/recordCoveredSettlement.ts` | R0 ledger link |
| `apps/web/lib/observability/paymentStructuredLog.ts` | Structured R0 / equipment events |
| `apps/web/lib/payout/bookingEarningsIntegrity.ts` | Earnings integrity reads |
| `apps/web/lib/payout/adminBookingAssignmentEarningsGate.ts` | Gate uses cash SoT |
| `apps/web/scripts/repairPendingCollectedCashAnomaly.ts` | Optional dry-run/apply repair script |

### Tests

| Path | Coverage |
|------|----------|
| `apps/web/app/api/booking-v2/confirm/__tests__/route.test.ts` | Unpaid confirm → cash columns = 0 |
| `apps/web/lib/payments/__tests__/settleFullyCoveredBooking.test.ts` | R0 fail/success paths; full paid-state transition |
| `apps/web/lib/booking/__tests__/adminEquipmentFeeUpdate.test.ts` | Paid cash preserved; unpaid zeroed |
| `apps/web/lib/booking/__tests__/bookingPaidAmountColumns.test.ts` | Zero/uncollected helper |
| `apps/web/lib/booking/__tests__/bookingPaymentSettlementState.test.ts` | Settlement state rules |
| `apps/web/lib/booking/__tests__/pendingCollectedCashAnomalyRepair.test.ts` | Anomaly classification |
| `apps/web/lib/booking/__tests__/paymentRecoveryEmailGuards.test.ts` | Recovery unpaid detection |
| Related quote / earnings gate test deltas | No cash mutation on quote; gate reads SoT |

### Database

| Path | Role |
|------|------|
| `supabase/migrations/20260714140000_bookings_r0_paid_amount_constraint.sql` | R0 CHECK + `settle_booking_fully_covered` RPC |
| `supabase/tests/bk002_r0_paid_amount_constraint_validation.sql` | SQL validation cases |

### Docs (Phase A / R1)

ADR, data dictionary, Phase A remediation notes, staging checklist, risk/debt register snippets, runbook updates, internal release notes, this verification report.

---

## Business-rule changes

1. **BK-001** — Unpaid Booking V2 confirmation writes **zero** collected-cash columns (`amount_paid_cents`, `total_paid_cents`, `total_paid_zar`). Payable remains in `total_price` / `price_snapshot`.
2. **BK-002** — R0 settlement prefers atomic RPC; app fallback records `promo_credit_cover` ledger first, then updates booking. Update/RPC failure returns explicit failure (`ok: false`) and must not present a successful payment state to the client (confirm returns **503**). Success sets: `payment_status=success`, `status` pending transition, `payment_completed_at`, `billing_type=prepaid`, linked `payment_transaction_id`, **zero** collected cash.
3. **BK-003** — Admin equipment PATCH adjusts payable `total_price` only on paid bookings; does **not** rewrite historical collected-cash columns; may set `payment_mismatch` when fee changes diverge from cash.

All monetary writes on these paths are server-side from authoritative pricing / settlement helpers (not client cash amounts).

---

## Test evidence

| Suite | Result |
|-------|--------|
| Targeted R1 vitest (settle / equipment / cash columns / confirm / settlement state / anomaly / recovery / quote / earnings gate) | **PASS** (39 tests) |
| `npm run test:critical` | **PASS** (34 tests) |
| Re-check after governance follow-ups (key 4 files) | **PASS** (16 tests) |
| `npm run typecheck` (apps/web) | **PASS** |
| ESLint on R1 changed TS surfaces | **PASS** |
| `npm run db:migrations:validate` | **PASS** (10 active migrations) |
| `next build --webpack` | **PASS** |
| Default `npm run build` (Turbopack) | **FAIL** — monorepo `@shalean/*` resolution (environment / Next 16 Turbopack); **not introduced by R1 cash SoT** — webpack path used by `dev` and verified green |

---

## Remaining risks

| Risk | Notes |
|------|-------|
| Migration not yet applied to staging/prod | App fallback works without RPC; constraint still needs forward migrate before relying on DB enforcement |
| Pre-existing anomalous `pending_payment` rows with positive cash | Repair script exists; dry-run/apply only after separate approval |
| R0 notify / dispatch “full finalize side effects” residual | Deferred to R5 per Phase 2 roadmap — R1 covers cash/settlement persistence integrity |
| Credits/promo pre-settle spend | Still live — R2 |
| Ops reject / RBAC / marketing / payout hard gates | Out of R1 |
| Turbopack default build in local env | Use `--webpack` or CI’s proven path until monorepo turbopack resolution is fixed separately |

---

## Working-tree status (at report authoring)

- Branch: `fix/p2-r1-cash-sot-integrity`
- Intentional R1 commits on branch tip (cherry-pick + governance follow-up + this report)
- Untracked Phase 2 audit package may still exist locally: `docs/audits/phase-2-end-to-end-workflow-audit/` — **not part of R1 commit**

---

## Comparison against `origin/main`

```text
git log --oneline origin/main..HEAD
# cherry-pick of Phase A cash integrity + R1 governance adaptations
```

Diff focuses on booking confirm cash writes, R0 settle helper/RPC, equipment paid-cash preservation, migration, and tests/docs listed above.

---

## Staging smoke-test checklist

Before any production release approval:

1. [ ] Apply `20260714140000_bookings_r0_paid_amount_constraint.sql` to **staging** only; re-run `npm run db:migrations:validate` locally (already PASS on branch).
2. [ ] Unpaid Booking V2 confirm → DB row: `payment_status=pending`, `status=pending_payment`, `amount_paid_cents=0`, `total_paid_*=0`, `total_price` = payable.
3. [ ] Paid Paystack finalize path unchanged (existing critical tests + smoke small charge).
4. [ ] R0 fully covered confirm → `payment_status=success`, linked `promo_credit_cover` tx, cash columns remain 0; failed persist does not return UI success.
5. [ ] Admin equipment fee change on **paid** booking → collected cash unchanged; `total_price` updates; `payment_mismatch` when expected.
6. [ ] Admin equipment fee on **unpaid** booking → cash columns stay 0; payable updates.
7. [ ] Optional: dry-run `repairPendingCollectedCashAnomaly.ts` against staging (no `--apply` without approval).
8. [ ] Confirm NO production deploy from this branch until separate release authorization.

---

## Next gate

**Stop.** Do not start R2 without separate explicit authorization. Do not merge to `main` or deploy from this report alone.
