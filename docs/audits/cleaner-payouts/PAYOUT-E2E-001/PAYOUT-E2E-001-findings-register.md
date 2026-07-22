# PAYOUT-E2E-001 — Findings Register

| ID | Severity | Area | Finding | Evidence | Impact | Root cause | Recommendation | Status |
| -- | -------- | ---- | ------- | -------- | ------ | ---------- | -------------- | ------ |
| PAYOUT-E2E-001-F01 | Critical | Edit routing | Adjust API selects solo vs team using **only** `bookings.is_team_job` | `apps/web/app/api/admin/bookings/[id]/adjust-payout-earnings/route.ts` L47–90 | Member/pseudo-team edits take wrong writer | Incomplete classifier | Multi-signal classifier (see SoT matrix §5) | Open |
| PAYOUT-E2E-001-F02 | Critical | Edit / display parity | Office can show cleaner earnings from `team_job_member_payouts` while solo adjust never updates that table → **success + unchanged amount** | `officePayoutPeriodReport.ts` `mergeTeamMemberPayoutAllocations`; `adjustBookingPayoutEarnings.ts` (no TJ update); unit test `officePayoutPeriodReportTeamAllocations.test.ts` | False success; wrong pay basis | Write path ≠ read path | Member writes must update the same rail office reads; RAW assert | Open |
| PAYOUT-E2E-001-F03 | Critical | API integrity | Adjust returns success after `select("id")` only — **no read-after-write** of selected cleaner effective cents | `adjustBookingPayoutEarnings.ts` L104–142; team adjust L114–161 | Silent wrong-field updates still return `ok` | Missing post-condition | Assert allocation == requested before ok | Open |
| PAYOUT-E2E-001-F04 | High | UI false success | Edit panel counts HTTP 200 `ok:true` including maker–checker **proposal** as saved | `OfficeCleanerEarningsEditPanel.tsx` L189–206; route L110–117 | Toast success while DB unchanged | UI ignores `requires_approval` | Treat proposal as pending; do not claim Updated N | Open |
| PAYOUT-E2E-001-F05 | Critical | Batch sync | `syncPayoutBatchFromBookings` sums booking hybrid + `booking_roster_member_payouts` only — omits `team_job_member_payouts` | `syncPayoutBatchFromBookings.ts` L33–55 | Open batch totals drift after team member edits | Incomplete re-sum | Include TJ pending/batched lines for payout id | Open |
| PAYOUT-E2E-001-F06 | High | Solo multi-cleaner write | Solo adjust always overwrites booking-level `cleaner_payout_cents` / `display_earnings_cents` even when editing a non-primary cleaner | `adjustBookingPayoutEarnings.ts` L76–82 | Corrupts lead hybrid / job-card basis | Solo writer assumes single owner | Route member edits to member writer; never overwrite lead hybrid for members | Open |
| PAYOUT-E2E-001-F07 | High | Team edit gate | Team adjust requires cleaner in `earnings_summary`; cleaners only on TJ rows are **rejected** on team path and **mis-handled** on solo path | `adjustBookingTeamMemberPayoutEarnings.ts` L56–59 | Cannot correctly edit TJ-only members | Summary-only membership check | Accept TJ/roster membership | Open |
| PAYOUT-E2E-001-F08 | High | Paired roster | Solo/member edit does not update `booking_roster_member_payouts` while generate/sync use that table for non-lead batch lines | `adjustBookingPayoutEarnings.ts`; `generateWeeklyPayouts.ts`; `syncPayoutBatchFromBookings.ts` | Office summary vs batch divergence | Missing roster write | Patch roster member rows on edit | Open |
| PAYOUT-E2E-001-F09 | High | Dual rails | Weekly `cleaner_payouts` and ledger `cleaner_earnings` Paystack paths both exist | `executeCleanerApprovedEarningsPaystack.ts`; `paystackPayout.ts`; phase15a | Duplicate pay risk if gates fail/misconfigured | Historical dual architecture | Single disbursement rail or hard mutual exclusion + monitoring | Open |
| PAYOUT-E2E-001-F10 | High | Audit durability | `logAdminEarningsAction` is **best-effort** (never throws; errors only warned) | `logAdminEarningsAction.ts` L14–33 | Financial mutation without durable admin action row | Soft audit | Fail closed or transactional outbox for audit | Open |
| PAYOUT-E2E-001-F11 | High | Test gap | `adjustBookingPayoutEarnings.test.ts` only tests cap helper; team adjust test only checks export | Test files under `lib/payout/__tests__` | Regressions ship unnoticed | Incomplete tests | Integration tests for pseudo-team / TJ-only / RAW | Open |
| PAYOUT-E2E-001-F12 | Medium | Job vs dashboard | Job cards use `resolveCleanerEarningsCents` (no summary per-cleaner); dashboard/office use summary-first | `resolveCleanerEarnings.ts` | Cleaner job UI ≠ earnings screen | Dual resolvers | Unify on dashboard resolver with cleaner id | Open |
| PAYOUT-E2E-001-F13 | Medium | Edit UX | Save always sends `bonus_cents: 0`, collapsing any prior bonus into base | `OfficeCleanerEarningsEditPanel.tsx` L191 | Bonus attribution lost | UI simplification | Preserve bonus or edit total with explicit split | Open |
| PAYOUT-E2E-001-F14 | Medium | Observability | Visit adjust logs system event + best-effort admin action; not full `payout_audit_events` money schema | Adjust libs; `payoutAudit.ts` | Incomplete forensic trail | Split audit systems | Emit durable payout audit with before/after cents | Open |
| PAYOUT-E2E-001-F15 | Medium | Frozen team total | Team member edit sets `payout_frozen_cents` to **team sum**, solo sets to edited display | Team/solo adjust libs | Frozen semantics ambiguous across modes | Inconsistent freeze write | Freeze per-cleaner or document single meaning | Open |
| PAYOUT-E2E-001-F16 | Low | Docs/env | Production `PAYOUT_MAKER_CHECKER` value not verified this session | `.env.example` commented; MCP env unread | Unknown whether F04 active in prod | Ops visibility | Record live env in evidence | Open |
| PAYOUT-E2E-001-F17 | High | Data integrity | Production anomaly counts unknown (Supabase MCP blocked) | MCP auth timeout | Unknown live exposure magnitude | Tooling failure | Run SQL pack read-only | Blocked |
| PAYOUT-E2E-001-F18 | Medium | Remove flow residual | Remove/reassign is relatively careful but depends on same allocation classifier; orphans possible if TJ status not pending | `removeCleanerFromVisitPayout.ts` | Orphan member payout rows | Status-gated deletes | Verify TJ/roster cleanup for all statuses allowed to edit | Open |
| PAYOUT-E2E-001-F19 | Medium | Accounting boundary | Zoho sync is not cleaner transfer SoT — ops may assume accounting equals payouts | accounting-sync cron; ENV docs | False reconciliation comfort | Scope mismatch | Document boundary; optional future payout export | Open |
| PAYOUT-E2E-001-F20 | Low | Input precision | Edit UI rounds to whole Rands (`Math.round(cents/100)`) | `OfficeCleanerEarningsEditPanel.tsx` | Sub-Rand edits impossible | UX | Accept if policy; else support cents | Open |

## Severity roll-up

| Severity | Count |
|----------|-------|
| Critical | 4 (F01–F03, F05) |
| High | 9 |
| Medium | 5 |
| Low | 2 |
| Blocked evidence | F17 |

## Instance note — known URL

```text
https://shalean.co.za/office/payouts?editCleaner=914b3acf-40e8-4ad5-a5a2-9e2de711849a&from=2026-07-01&to=2026-07-31
```

Defect **class** confirmed in code. Binding this UUID to F02 requires production read of July visits (BLOCKED this session).
