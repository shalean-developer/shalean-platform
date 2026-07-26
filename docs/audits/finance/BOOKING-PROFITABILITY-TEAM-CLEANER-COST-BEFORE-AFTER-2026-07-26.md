# Booking profitability team cleaner-cost fix — before/after evidence

**Date:** 2026-07-26  
**PR scope:** Office Booking Profitability cleaner-cost calculation only. No payout redistribution. No deploy/merge without approval.

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

Team jobs with `cleaner_earnings_total_cents = null` must surface **Incomplete team earnings** and be excluded from trusted net-profit totals — never silently use display earnings.

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

## Team-size coverage

Same test file covers 2-, 3-, 5-, and 9-person teams: cleaner cost equals the team total, never the lead member’s display amount.

## Incomplete team path (e.g. SHL-BK-000527)

| Metric | Before | After |
|--------|--------|-------|
| Cleaner cost when team total null | Silently used display (one cleaner) | `null` + warning |
| Net profit | Inflated / untrusted | `null`, excluded from trusted totals |
| UI | Looked complete | Visible **Incomplete team earnings** |

Investigation note (no payout changes):  
`docs/audits/finance/SHL-BK-000527-incomplete-team-earnings-2026-07-26.md`

## Code touchpoints

- `apps/web/lib/admin/expenses/bookingProfitabilityCleanerCost.ts` — resolver + trusted totals
- `apps/web/app/api/admin/booking-profitability/route.ts` — uses resolver; selects `is_team_job`
- `apps/web/app/(ui-redesign)/office/booking-profitability/page.tsx` — warning UI
- `apps/web/lib/admin/expenses/loadFinancialDashboard.ts` — aligned team-cost rollups
- `apps/web/app/api/admin/bookings/[id]/expenses/route.ts` — same cost rule for booking expense profit

## Explicit non-changes

- Individual cleaner payout amounts / `team_job_member_payouts` rows are not modified
- Cleaner-facing earnings (`resolveCleanerEarningsCents`) left unchanged for mobile/cleaner UX
