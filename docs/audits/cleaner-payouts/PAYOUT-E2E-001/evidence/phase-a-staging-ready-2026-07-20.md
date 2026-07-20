# PAYOUT-E2E-001 Phase A — Staging-ready evidence

| Field | Value |
|-------|-------|
| **Date** | 2026-07-20 |
| **Branch** | `fix/payout-e2e-001-phase-a-earnings-source-integrity` |
| **Base** | `origin/main` @ `ad667d7d…` (docs) / payout code from `main` |
| **Scope** | Phase A earnings-source integrity (+ batch sync TJ inclusion) |
| **Not done** | Production deploy, migrations, payout generation, transfers, data repair, accounting-sync activation |

## Implemented

| ID | Item | Status |
|----|------|--------|
| A1 | `classifyVisitPayoutEdit` multi-signal classifier | Done |
| A2 | Route via `adjustVisitPayoutEarnings` facade | Done |
| A3 | Per-cleaner writer updates summary + TJ + roster member rows | Done |
| A4 | Read-after-write via office allocation resolver | Done |
| A5 | Maker–checker pending UX (`requires_approval` / `applied`) | Done |
| A6 | No lead hybrid overwrite on member edits | Done |
| A7 | Fail-closed `payout_audit_events` (`visit_earnings_adjusted`) | Done |
| B1 (pulled forward) | `syncPayoutBatchFromBookings` includes batched TJ by cleaner+period | Done |

## Key files

- `apps/web/lib/payout/classifyVisitPayoutEdit.ts`
- `apps/web/lib/payout/adjustVisitPayoutEarnings.ts`
- `apps/web/lib/payout/adjustBookingTeamMemberPayoutEarnings.ts`
- `apps/web/lib/payout/adjustBookingPayoutEarnings.ts`
- `apps/web/lib/payout/syncPayoutBatchFromBookings.ts`
- `apps/web/lib/payout/assertVisitEarningsReadAfterWrite.ts`
- `apps/web/lib/payout/requireVisitEarningsAdjustAudit.ts`
- `apps/web/app/api/admin/bookings/[id]/adjust-payout-earnings/route.ts`
- `apps/web/components/admin/office/OfficeCleanerEarningsEditPanel.tsx`

## Unit evidence

```bash
cd apps/web
npx vitest run \
  lib/payout/__tests__/classifyVisitPayoutEdit.test.ts \
  lib/payout/__tests__/upsertEarningsSummaryForCleaner.test.ts \
  lib/payout/__tests__/adjustBookingTeamMemberPayoutEarnings.phaseA.test.ts \
  lib/payout/__tests__/syncPayoutBatchFromBookings.phaseA.test.ts \
  lib/payout/__tests__/assertVisitEarningsReadAfterWrite.test.ts \
  lib/payout/__tests__/adjustBookingPayoutEarnings.test.ts \
  lib/payout/__tests__/patchEarningsSummaryForCleaner.test.ts \
  lib/admin/__tests__/officePayoutPeriodReportTeamAllocations.test.ts \
  --reporter=verbose
```

**Result (2026-07-20):** all listed files green (Phase A suite).

## Staging verification still required (manual)

1. Deploy preview / staging branch only (no production promote).
2. Seed or locate a booking with `is_team_job=false`, lead in summary, member only in `team_job_member_payouts`.
3. Edit member amount in `/office/payouts?editCleaner=…`.
4. Confirm: HTTP `applied:true`, TJ row updated, lead hybrid unchanged, cleaner-visits shows new amount, `payout_audit_events.event_type=visit_earnings_adjusted`.
5. With `PAYOUT_MAKER_CHECKER=true`, confirm UI says proposed / amounts unchanged.
6. Open pending batch for that cleaner: confirm sync total includes TJ.

## Constraints honored

- No production deployment
- No migrations
- No payout generation / transfer / accounting-sync activation
- No production data repair
- No customer/cleaner communications
