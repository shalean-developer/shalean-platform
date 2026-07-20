# PAYOUT-E2E-001 Phase A — Staging-ready evidence

| Field | Value |
|-------|-------|
| **Date** | 2026-07-20 |
| **Branch** | `fix/payout-e2e-001-phase-a-earnings-source-integrity` |
| **Commit** | `6d5778bb58b800f8bf3ea4c01d85da9e01161870` |
| **Draft PR** | https://github.com/shalean-developer/shalean-platform/pull/76 |
| **Base** | `origin/main` @ `ad667d7d…` (docs) / payout code from `main` |
| **Scope** | Phase A earnings-source integrity (+ batch sync TJ inclusion) |
| **Not done** | Production deploy, migrations, payout generation, transfers, data repair, accounting-sync activation |

## Gate status (2026-07-20 late)

| Gate | Status | Evidence |
|------|--------|----------|
| Local implementation | **Complete** | Commit `6d5778bb` on dedicated branch |
| Draft PR | **Open** | PR #76 (draft) |
| Migration governance | **Passed** | `validate-migration-filenames` SUCCESS on run `29780902866` |
| GitHub CI (`web-test` / vitest) | **Blocked** | Failed at `Production dependency audit (high+)` — `npm audit --omit=dev --audit-level=high` reports high `brace-expansion` (via `glob`) and moderate `postcss`/`next`/`geist`. Not a Phase A test failure; suite did not reach payout unit steps. |
| Vercel preview | **Failed** | Deployment `dpl_CAzedbV93r85fqR8xjxkS18UWFDA` failed (inspect separately; may be env/build, not payout logic) |
| Staging behavioral verification | **Not completed** | Manual matrix in § Staging verification still required |

### CI blocker detail (not Phase A regression)

Workflow: [web-test run 29780902866](https://github.com/shalean-developer/shalean-platform/actions/runs/29780902866)

```text
npm run audit:production
→ npm audit --omit=dev --audit-level=high
→ exit 1

high:     brace-expansion (glob) — GHSA-3jxr-9vmj-r5cp
moderate: postcss <8.5.10 (via next) — GHSA-qx2v-qp2m-jg93
```

Downstream CI steps (critical tests, typecheck, PR build crawl) were **skipped** after this gate. Local Phase A unit suite remains green; GitHub did not execute those payout tests in this run.

**Recommendation:** treat dependency audit as a separate hardening track (or waive/bump on main) — do not conflate with Phase A earnings integrity. Staging behavioral verification can proceed on a Vercel preview once preview deploy is healthy, independently of the audit gate if ops accepts that risk for draft-only staging.

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
