# PAYOUT-E2E-001 — Remediation Plan

**Do not implement without separate authorization.** This plan only.

---

## Emergency containment

| Item | Owner | Action | Risk if skipped | Rollback |
|------|-------|--------|-----------------|----------|
| E0 | Ops lead | Pause reliance on visit edit success toasts; verify DB rails before paying | Wrong pay | Re-enable after Phase A |
| E1 | Ops lead | Before each transfer run: reconcile batch total vs allocations including TJ + roster | Over/under pay | N/A |
| E2 | Eng/ops | Confirm `PAYOUT_MAKER_CHECKER` and whether UI needs immediate hotfix warning | False success | Toggle flag |
| E3 | Eng | Disable or feature-flag visit bulk edit if hotfix not ready | Continued drift | Re-enable flag |
| E4 | Finance | No dual-rail auto-payout same period without phase15a review | Duplicate pay | Stop ledger cron |

---

## Phase A — Earnings-source integrity

**Goal:** One classifier; writes hit the same rails office/dashboard read; RAW before success.

| ID | Work | Owner | Dependency | Risk | Files | Migrations | Tests | Deploy gate | Rollback |
|----|------|-------|------------|------|-------|------------|-------|-------------|----------|
| A1 | Implement `classifyVisitPayoutEdit(booking, cleanerId)` multi-signal | Eng | None | Medium | new `lib/payout/classifyVisitPayoutEdit.ts`; adjust route | None | unit matrix | staging + RAW tests green | revert PR |
| A2 | Route member/pseudo-team to member writer; solo only for true single-owner | Eng | A1 | High | `adjust-payout-earnings/route.ts`, solo/team adjust libs | None | integration mock DB | staging edit matrix | revert |
| A3 | Member writer updates summary **and** TJ **and** roster member rows as applicable | Eng | A2 | High | team/solo adjust, roster helpers | Possibly none if columns exist | integration | staging | revert |
| A4 | Server RAW: reload allocation for `cleanerId`; fail if ≠ requested | Eng | A3 | Low | both adjust libs | None | unit | required | revert |
| A5 | UI: honor `requires_approval`; partial failure messaging; don’t claim success | Eng | None | Low | `OfficeCleanerEarningsEditPanel.tsx` | None | component/unit | can ship early | revert |
| A6 | Stop overwriting lead hybrid when editing member | Eng | A2 | High | `adjustBookingPayoutEarnings.ts` | None | unit | staging | revert |
| A7 | Durable audit: before/after cents, cleanerId, bookingId; fail closed or outbox | Eng | A4 | Medium | adjust libs, `logAdminEarningsAction` / `payoutAudit` | maybe audit table cols | unit | staging | soft-fail flag |

**Phase A exit:** F01–F04, F06–F08 addressed; staging reproduction matrix green.

---

## Phase B — Payout batch integrity

| ID | Work | Owner | Dependency | Risk | Files | Migrations | Tests | Deploy gate | Rollback |
|----|------|-------|------------|------|-------|------------|-------|-------------|----------|
| B1 | `syncPayoutBatchFromBookings` include `team_job_member_payouts` for payout id | Eng | A3 | High | `syncPayoutBatchFromBookings.ts` | None | unit + fixture | staging regenerate | revert |
| B2 | Generate path reconciliation report: booking count, cleaner count, calc vs total | Eng | B1 | Medium | `generateWeeklyPayouts.ts`, admin API | None | unit | staging month dry-run | revert |
| B3 | Prevent double inclusion across weekly booking payout_id + TJ payout id bugs | Eng | B2 | High | generate + integrity cron | None | SQL + unit | integrity pack | revert |
| B4 | Lock visit edits when batch in run / approved (already partial) — audit gaps | Eng | None | Medium | `visitPayoutEditGuards.ts` | None | unit | staging | revert |

**Phase B exit:** Batch total == sum of allocations for every open batch in staging sample.

---

## Phase C — Transfer integrity

| ID | Work | Owner | Dependency | Risk | Files | Migrations | Tests | Deploy gate | Rollback |
|----|------|-------|------------|------|-------|------------|-------|-------------|----------|
| C1 | Review dual-rail: prefer single rail or hard mutex + alert on anomaly | Eng/Arch | B | High | ledger + weekly pay paths, phase15a | maybe feature flags | phase15a + failure injection | anomaly count 0 on staging | flag off |
| C2 | Confirm webhook + reconcile cover all subject types; stale outbox SLO | Eng | C1 | Medium | webhook, crons, executor | None | idempotency + clock skew | cron health | revert |
| C3 | Never mark paid without success transfer row (and inverse alert) | Eng | C2 | High | `paystackTransferStatus.ts`, integrity cron | None | unit + SQL | integrity | revert |

**Phase C exit:** No credible duplicate-transfer path in threat model review.

---

## Phase D — Reconciliation and accounting

| ID | Work | Owner | Dependency | Risk | Files | Migrations | Tests | Deploy gate | Rollback |
|----|------|-------|------------|------|-------|------------|-------|-------------|----------|
| D1 | Document Zoho ≠ cleaner Paystack; optional export of paid batches | Finance/Eng | C | Low | docs + optional export | None | N/A | docs review | N/A |
| D2 | Daily integrity job alerts on F02 population + batch drift | Eng | B1 | Medium | `payout-integrity-daily` | None | unit | staging alert dry-run | disable alert |
| D3 | Office vs cleaner dashboard parity job (sample cleaners) | Eng | A | Medium | new check / cron | None | unit | staging | disable |

---

## Phase E — Observability and governance

| ID | Work | Owner | Dependency | Risk | Files | Migrations | Tests | Deploy gate | Rollback |
|----|------|-------|------------|------|-------|------------|-------|-------------|----------|
| E1 | Required event schema for all money mutations (actor, before/after, correlation id) | Eng | A7 | Medium | payout audit | migration | contract tests | staging | feature flag |
| E2 | Expand test suite to required matrix in audit §12 | Eng | A–C | Low | `__tests__` | None | CI required | CI green | N/A |
| E3 | Runbook: edit failure, reconcile, dual-rail conflict | Ops | D | Low | docs | None | tabletop | published | N/A |
| E4 | Governance: no payout feature merge without SoT checklist | Eng lead | E2 | Low | PR template / rule | None | N/A | process | N/A |

---

## Suggested sequencing

```text
E0–E4 (containment)
  → A5 (UI hotfix, fast)
  → A1–A4, A6–A7 (core edit integrity)
  → B1–B4
  → C1–C3
  → D1–D3
  → E1–E4
```

## Deployment policy

| Environment | Gate |
|-------------|------|
| Staging | Full edit matrix + integrity SQL |
| Production | Explicit authorization; no transfer during deploy window; post-deploy integrity pack |

## Explicit non-goals for first hotfix

- Rewriting the v3 earnings formula
- Merging ledger and weekly rails in one PR (prefer mutex first)
- Live Paystack test transfers against production recipients
