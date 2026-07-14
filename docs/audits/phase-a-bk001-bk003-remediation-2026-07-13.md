# Phase A remediation — BK-001 / BK-002 / BK-003

| Field | Value |
|-------|-------|
| **Date** | 2026-07-13 |
| **Branch** | `fix/bk-001-confirm-cash-columns-before-payment` |
| **Audit** | [`customer-booking-journey-seos-audit-2026-07-13.md`](./customer-booking-journey-seos-audit-2026-07-13.md) |
| **ADR** | [`../adr/2026-07-13-booking-payment-settlement-cash-columns.md`](../adr/2026-07-13-booking-payment-settlement-cash-columns.md) |

## Status

| Finding | Status |
|---------|--------|
| BK-001 | **Resolved pending release verification** |
| BK-002 | **Resolved pending migration and staging verification** |
| BK-003 | **Resolved pending release verification** |
| BK-004+ | **Not implemented** (out of scope) |

Phase A is **not** production-closed until staging matrix sign-off and controlled release.

## Summary

Unpaid Booking V2 confirms now write zero collected-cash columns. R0 settlement is error-checked, ledger-linked, and constraint-aligned. Admin equipment updates preserve paid cash and adjust payable `total_price` only.

## Data correction

Script: `apps/web/scripts/repairPendingCollectedCashAnomaly.ts`

```bash
cd apps/web
npx tsx --env-file=.env.local scripts/repairPendingCollectedCashAnomaly.ts --dry-run
# reviewed apply only after approval:
npx tsx --env-file=.env.local scripts/repairPendingCollectedCashAnomaly.ts --apply
```

Dry-run was **not** executed against production in this change.

## Out of scope (explicit)

Cleaning credit pre-spend (BK-004), promo pre-redeem (BK-005), SLA/soft-fulfilment, rate limits, and dual pricing consolidation were not changed.
