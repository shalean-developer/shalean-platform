# PAYOUT-E2E-001 — Executive Audit Report

| Field | Value |
|-------|-------|
| **Audit ID** | PAYOUT-E2E-001 |
| **Title** | Cleaner Payout System — End-to-End Audit |
| **Date (Africa/Johannesburg)** | 2026-07-20 |
| **Mode** | Read-only code + unit-test evidence; production/staging DB writes forbidden |
| **Audit opinion** | **NO-GO** |
| **Overall score** | **42 / 100** |

---

## 1. Environment and identity

| Item | Value |
|------|-------|
| Repository | `shalean-developer/shalean-platform` |
| Audit workspace branch | `docs/bill-inv-002-phase-a-production-release` @ `3e49bd0941e5f5f5cbdc88e7fa9954c04391e57d` |
| `main` (local / origin) | `f5319b77cd3b74a13afc32891814a083cce6db36` — BILL-INV-002 Phase A payment integrity |
| Latest GitHub `main` tip (docs merge) | `ad667d7d13db3fbdd630f08074ff6981e7505d4c` (docs-only; may not be present in shallow local clone) |
| Production Vercel deployment (latest observed) | env `Production`, SHA `ad667d7d…` (docs) then prior app SHA `f5319b77…` |
| Customer hostname | `https://shalean.co.za` |
| Production Supabase | parent ref `tchayecuvzssixyxlvfu` (from ENV-01 inventory) |
| Staging Supabase | dedicated project ref `gfvdiczqyrvlmynvgegd` (ENV-01/03) |
| Code under audit for payout logic | Matches `main` @ `f5319b77…` for payout edit/batch/transfer paths (docs branch does not alter payout runtime) |

**Deployment note:** `main`, staging, and production must not be assumed identical. Payout mutation code reviewed here is present on `main` @ `f5319b77…` and was previously deployed to Production. Live env flags (e.g. `PAYOUT_MAKER_CHECKER`) were **not** readable in this session.

**Database note:** Supabase MCP authentication failed / timed out. All production integrity counts are **BLOCKED** pending authorized read-only SQL. Integrity **queries** are published in `PAYOUT-E2E-001-data-integrity.md`.

---

## 2. Scope

In scope:

- `/office/payouts`, `editCleaner` flows, visit edit/remove APIs
- Solo, paired-roster, team, and legacy multi-cleaner earnings
- Monthly/weekly batch generation, freeze, approve, Paystack outbox/webhook
- Cleaner dashboard earnings read path vs office report
- Dual rails (`cleaner_payouts` weekly vs `cleaner_earnings` ledger)
- AuthZ, audit logging, tests

Out of scope / not performed:

- Live Paystack transfers
- Production mutations, migrations, payout approvals
- Remediation implementation
- Zoho transfer of cleaner payouts (accounting sync is invoice/expense oriented, not cleaner disbursements)

---

## 3. Audit opinion

**NO-GO for unrestricted payout operations and earnings editing.**

Credible paths remain for:

1. **False success** after visit earnings edit (UI shows success while selected cleaner amount unchanged).
2. **Wrong-field / wrong-rail writes** when `is_team_job` is false but multi-cleaner allocations exist.
3. **Batch totals that ignore team member payout rows** on sync after visit edits.
4. **Dual disbursement rails** with residual conflict risk (mitigations exist; residual operational risk remains).
5. **Best-effort** financial audit logging for visit adjustments.

A `PASS` is not available under the stated gates.

---

## 4. Critical findings (summary)

| ID | Finding |
|----|---------|
| **PAYOUT-E2E-001-F01** | Edit API routes solo vs team **only** on `bookings.is_team_job`. |
| **PAYOUT-E2E-001-F02** | Office visit list can attribute earnings from `team_job_member_payouts` while solo adjust **never updates** that table → success + unchanged UI. |
| **PAYOUT-E2E-001-F03** | No server read-after-write assertion of the selected cleaner’s effective earnings before `ok: true`. |
| **PAYOUT-E2E-001-F04** | UI treats maker–checker `requires_approval` (HTTP 200 `ok: true`) as a successful save. |
| **PAYOUT-E2E-001-F05** | `syncPayoutBatchFromBookings` re-sums booking hybrid + `booking_roster_member_payouts` only — **not** `team_job_member_payouts`. |

Full register: `PAYOUT-E2E-001-findings-register.md`.

---

## 5. Confirmed root cause — edit earnings “success but amount unchanged”

**Confirmed (code + unit fixture):**

Office editable visits resolve per-cleaner amounts via `perCleanerAllocationsForBooking`, which can include cleaners present **only** in `team_job_member_payouts` (see unit test `officePayoutPeriodReportTeamAllocations.test.ts`).

The adjust route:

```text
is_team_job === true  → adjustBookingTeamMemberPayoutEarnings
                     → requires cleaner in earnings_summary
                     → updates summary + team_job_member_payouts

is_team_job !== true → adjustBookingPayoutEarnings
                     → updates booking hybrid columns (+ optional summary patch)
                     → does NOT touch team_job_member_payouts
```

Therefore for a cleaner shown from the team-member table on a booking with `is_team_job = false` (or a member missing from `earnings_summary` when routed incorrectly):

1. Admin edits amount in `/office/payouts?editCleaner=…`
2. API returns success
3. Reload still reads the old `team_job_member_payouts.payout_cents`
4. Displayed amount does not change

This validates the audit hypothesis that **`is_team_job`-only routing is insufficient**. The correct classifier must consider roster, summary, team member rows, requested cleaner id, and owner fields.

**Additional confirmed false-success path:** when `PAYOUT_MAKER_CHECKER=true`, the API returns `{ ok: true, requires_approval: true }` without applying; the office panel increments `saved` on `res.ok` and toasts success.

**Production row for** `editCleaner=914b3acf-40e8-4ad5-a5a2-9e2de711849a` **July 2026:** not inspected (DB MCP blocked). Classify instance confirmation as **BLOCKED** pending read-only query of that cleaner’s July visits.

---

## 6. Financial exposure

| Exposure | Assessment |
|----------|------------|
| Wrong cleaner paid / underpaid relative to office UI | **High** — UI and batch rails can diverge |
| Duplicate payment across weekly + ledger rails | **Medium–High** — phase15a gates exist; dual rails still operational |
| Approved/paid amount drift after visit edits | **High** for open batches if sync omits team rows |
| Unauthorized payout mutation | **Low–Medium** — admin allowlist required; IDOR on admin booking id still depends on allowlist trust |
| Unreconciled Paystack transfer | **Medium** — outbox + `needs_reconcile` design is sound; residual ops risk if reconcile cron fails |

**Immediate financial control recommendation:** freeze visit-level earnings edits and batch amount sync reliance until Phase A remediation lands; prefer manual verified adjustments with dual review.

---

## 7. Operational / cleaner / customer impact

| Party | Impact |
|-------|--------|
| Ops (office payouts) | False confidence after edits; manual reconciliation burden |
| Cleaners | Dashboard may show different amounts than office or than eventual transfer |
| Customers | Indirect — company margin / dispute risk if cleaner pay wrong; no direct checkout defect found in this audit |
| Finance / Zoho | Cleaner Paystack transfers are **not** the Zoho accounting-sync subject; reconciliation is internal |

---

## 8. Release recommendation

| Action | Recommendation |
|--------|----------------|
| New payout feature releases | **Hold** until Phase A earnings-source integrity |
| Monthly batch generation | **Conditional** — generate only with dual review of totals vs booking allocations |
| Paystack transfer runs | **Conditional** — maker–checker + reconcile cron healthy; no visit edits mid-run |
| Visit earnings edit UI | **Disable or warn** until classifier + RAW fix |
| Production hotfix | Authorized Phase A only (see remediation plan) |

---

## 9. Immediate controls (no code required)

1. Stop relying on visit edit success toasts without verifying DB amounts for the selected cleaner across: `earnings_summary`, `team_job_member_payouts`, `booking_roster_member_payouts`, booking hybrid columns.
2. Before approving any batch, reconcile `cleaner_payouts.total_amount_cents` to the sum of that cleaner’s allocations for linked bookings/member rows.
3. Do not run ledger-rail auto-payout and weekly-rail pay for the same period without phase15a anomaly review.
4. Capture production env: `PAYOUT_MAKER_CHECKER`, Paystack mode, reconcile cron schedule.
5. Run integrity SQL in `PAYOUT-E2E-001-data-integrity.md` read-only on production.

---

## 10. Remediation roadmap (summary)

| Phase | Focus |
|-------|-------|
| **Emergency** | Contain edits / dual-rail ops |
| **A** | Canonical classifier + RAW + sync team/roster rows |
| **B** | Batch generation/sync integrity |
| **C** | Transfer outbox/webhook hardening review |
| **D** | Reconciliation + accounting boundary clarity |
| **E** | Durable audit events + governance |

Details: `PAYOUT-E2E-001-remediation-plan.md`.

---

## 11. Decision gate

```text
AUDIT DECISION: NO-GO
```

Reason: Confirmed false-success and wrong-source write paths for visit earnings edits; batch sync omission of team member rows; incomplete SoT; insufficient integration tests for multi-cleaner edit workflows.
