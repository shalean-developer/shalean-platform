# Booking profitability team cleaner-cost fix — before/after evidence

**Date:** 2026-07-26 (updated after NO-GO review corrections)  
**PR:** https://github.com/shalean-developer/shalean-platform/pull/112  
**PR scope:** Office Booking Profitability / finance trusted rollups cleaner-cost calculation only. No payout redistribution. No deploy/merge without approval.

## Root cause

| Item | Detail |
|------|--------|
| Bug | Dashboard treated `bookings.display_earnings_cents` as cleaner cost |
| Why wrong | That column is one cleaner / lead cleaner amount |
| Correct source (team) | `bookings.cleaner_earnings_total_cents` (backfilled from `team_job_member_payouts` where available) |
| Correct source (solo) | `bookings.display_earnings_cents` |

## Required formula

```ts
const cleanerCostCents = booking.is_team_job
  ? booking.cleaner_earnings_total_cents
  : booking.display_earnings_cents;
```

For team jobs, `cleaner_earnings_total_cents` **null or ≤ 0** must surface **Incomplete team earnings** and be excluded from trusted totals — never silently use display earnings. No documented explicit zero-cost team state exists for profitability.

## Before / after — five-person team regression (R1,270 vs R250)

Fixture:

- `is_team_job = true`
- `display_earnings_cents = 25_000` (R250 — one cleaner)
- `cleaner_earnings_total_cents = 127_000` (R1,270 — team total)
- Customer payment `250_000` (R2,500), no expenses/fees

| Metric | Before (buggy) | After (fixed) |
|--------|----------------|---------------|
| Cleaner cost | R250 (`25_000`) | R1,270 (`127_000`) |
| Net profit | R2,250 (`225_000`) | R1,230 (`123_000`) |
| Margin | 90% | 49.2% |

Automated coverage: `apps/web/lib/admin/expenses/__tests__/bookingProfitabilityCleanerCost.test.ts`  
(`regression: five-person team totaling R1,270 must not display R250`)

## Review corrections (NO-GO → fixed)

### 1. Trusted rollups must not inflate gross margin

| Behaviour | Before correction | After correction |
|-----------|-------------------|------------------|
| Incomplete team in `loadFinancialDashboard` | Revenue added, payout omitted → inflated margin | Entire booking excluded from trusted revenue, payout, booking count, margin, profit |
| Operational visibility | Mixed into trusted maps | Separate `untrusted_incomplete_team` (`booking_count`, `customer_revenue_cents`) with clear UI label |

### 2. Period-wide trusted totals

| Behaviour | Before correction | After correction |
|-----------|-------------------|------------------|
| `trusted_totals` | Summed from current page only | Computed from **all** filtered period bookings, then page sliced |
| Pagination | Totals changed per page | Totals identical across pages (regression covered) |
| UI copy | “trusted net …” | “trusted period net …” |

### 3. Team total ≤ 0 is incomplete

| Input | Result |
|-------|--------|
| `cleaner_earnings_total_cents = null` | Incomplete team earnings, excluded |
| `cleaner_earnings_total_cents = 0` | Incomplete team earnings, excluded |
| `cleaner_earnings_total_cents > 0` | Included with that cleaner cost |

## Team-size coverage

Same test file covers 2-, 3-, 5-, and 9-person teams: cleaner cost equals the team total, never the lead member’s display amount.

## Incomplete team path (e.g. SHL-BK-000527)

| Metric | Before | After |
|--------|--------|-------|
| Cleaner cost when team total null/≤0 | Silently used display (one cleaner) | `null` + warning |
| Trusted revenue + cleaner cost | Revenue could remain without cost | Neither contributes to trusted margin/profit |
| Net profit | Inflated / untrusted | `null`, excluded from trusted totals |
| UI | Looked complete | Visible **Incomplete team earnings** |

Investigation note (no payout changes):  
`docs/audits/finance/SHL-BK-000527-incomplete-team-earnings-2026-07-26.md`

## Code touchpoints

- `apps/web/lib/admin/expenses/bookingProfitabilityCleanerCost.ts` — resolver, rollup contribution, period pagination helper, trusted totals
- `apps/web/app/api/admin/booking-profitability/route.ts` — period-wide fetch → trusted totals → page slice
- `apps/web/app/(ui-redesign)/office/booking-profitability/page.tsx` — period warning UI
- `apps/web/lib/admin/expenses/loadFinancialDashboard.ts` — trusted-only maps + `untrusted_incomplete_team`
- `apps/web/app/(ui-redesign)/office/financial-dashboard/page.tsx` — untrusted incomplete-team banner
- `apps/web/app/api/admin/bookings/[id]/expenses/route.ts` — same cost rule for booking expense profit

## Manual verification checklist

| Item | Result |
|------|--------|
| Unit/regression suite (incl. incomplete revenue exclusion, pagination-stable totals, total=0 excluded, positive total included) | Pass — `npx vitest run lib/admin/expenses/__tests__/bookingProfitabilityCleanerCost.test.ts` (19 tests) |
| Team booking with positive total uses team sum, not lead display | Covered by R1,270≠R250 + 2/3/5/9-person cases |
| Null / ≤0 team total → Incomplete + excluded | Covered by dedicated regressions |
| Solo booking still uses `display_earnings_cents` | Covered |
| No changes to `team_job_member_payouts` / individual cleaner payout amounts | Confirmed — PR diff has no payout write paths / no migration touching member payouts |
| SHL-BK-000527 prod probe | Script ready (`apps/web/scripts/investigate-shl-bk-000527.mjs`); service-role env unavailable in agent session — run against prod before merge if needed |
| Vercel Preview READY | Ready — https://shalean-platform-6r6zerfal-shalean-cleaning-services.vercel.app (inspect: https://vercel.com/shalean-cleaning-services/shalean-platform/3nJQUcHJpnyhcbbZagGhmw6fowxt). Initial push hit build OOM; redeploy succeeded. |

## Explicit non-changes

- Individual cleaner payout amounts / `team_job_member_payouts` rows are not modified
- Cleaner-facing earnings (`resolveCleanerEarningsCents`) left unchanged for mobile/cleaner UX
- No deploy/merge without approval
