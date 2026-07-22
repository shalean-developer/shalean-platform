# PAYOUT-E2E-001 Phase A — Staging behavioral verification

| Field | Value |
|-------|-------|
| **Document** | `phase-a-staging-verification-2026-07-21.md` |
| **Date / time** | 2026-07-21 (SAST / UTC during run ~07:45–07:51Z) |
| **Operator** | Cursor agent (automated staging harness + deployment identity probe) |
| **Branch** | `fix/payout-e2e-001-phase-a-earnings-source-integrity` |
| **Commit verified** | `c2baebcd329182d82d307a3dcee7131efbce8a25` |
| **Draft PR** | https://github.com/shalean-developer/shalean-platform/pull/76 |
| **Gate decision** | **CONDITIONAL PASS** |
| **Production release** | **NO-GO** |

## 1. Document control

| Item | Detail |
|------|--------|
| Scope | Phase A earnings-source integrity staging behavioral verification |
| Method | (A) Prove Vercel Preview deployment identity; (B) Exercise Phase A writers against staging Supabase `gbgnemlpyykyhpqqbgru` at the same commit via opt-in harness; (C) Unit-test fail-closed RAW / classifier paths |
| Not in scope | Production writes, migrations, payout generation, Paystack transfers, accounting sync, PR ready-for-review / merge |

## 2. Environment identity

### 2.1 Vercel Preview (PR #76)

| Field | Value |
|-------|-------|
| Deployment ID | `dpl_9ix9FieLBJcBResWYqQT83D3YYn3` |
| Deployment URL | `https://shalean-platform-fv7yjz1ox-shalean-cleaning-services.vercel.app` |
| Git alias | `https://shalean-platform-git-fix-payou-d0b052-shalean-cleaning-services.vercel.app` |
| GitHub deployment | id `5529604489`, environment `Preview`, sha `c2baebcd…` |
| Proven via | `GET /api/health/environment` (browser CDP) |

**Health response (redacted):**

```json
{
  "status": "ok",
  "deployment": "preview",
  "vercelEnv": "preview",
  "gitBranch": "fix/payout-e2e-001-phase-a-earnings-source-integrity",
  "shaleanAppEnv": null,
  "supabase": {
    "configuredRef": null,
    "expectedRef": null,
    "urlHost": null,
    "serviceRoleConfigured": false
  },
  "paystack": { "secretMode": "missing", "publicMode": "missing" },
  "marketingOAuth": { "gitSha": "c2baebcd329182d82d307a3dcee7131efbce8a25" }
}
```

**Conclusion:** Preview is **not production** and runs the exact Phase A commit, but **has no Supabase / Paystack configuration** because Preview env vars for DB are branch-scoped to `staging` / `development` only. Deployed UI/API earnings edits on this preview are therefore **impossible**.

### 2.2 Staging database (behavioral target)

| Field | Value |
|-------|-------|
| Project name | `shalean-platform-staging` |
| Project ref | `gbgnemlpyykyhpqqbgru` |
| Region | `eu-west-3` |
| CLI link | Confirmed (`supabase/.temp/project-ref`) |
| Distinct from production | Production ref `tchayecuvzssixyxlvfu` — not targeted |
| Transfer / outbox activity | `payout_transfer_outbox=0`, `payout_transfers=0`, `earnings_disbursement_transfers=0`, `cleaner_payout_runs=0` at pre-flight |

### 2.3 Feature flags

| Flag | Preview (PR branch) | Staging-branch Preview scope | Harness |
|------|---------------------|------------------------------|---------|
| `SHALEAN_APP_ENV` | unset (`null`) | `staging` | forced `staging` |
| `PAYOUT_MAKER_CHECKER` | empty / unset on PR branch | Encrypted on `Preview (staging)` | toggled per test (`false` applied path; `true` for T4) |

## 3. Commit and deployment identity

| Source | SHA |
|--------|-----|
| Local HEAD | `c2baebcd329182d82d307a3dcee7131efbce8a25` |
| PR #76 `headRefOid` | `c2baebcd329182d82d307a3dcee7131efbce8a25` |
| Vercel Preview health `marketingOAuth.gitSha` | `c2baebcd329182d82d307a3dcee7131efbce8a25` |
| GitHub Preview deployment | `c2baebcd329182d82d307a3dcee7131efbce8a25` |

CI on PR (at verification): migration-governance PASS, web-test/vitest PASS, GitGuardian PASS, Vercel Preview PASS, Supabase Preview skipped.

## 4. Test data identifiers (staging)

| Role | ID |
|------|-----|
| TJ-only booking | `04ee8cad-9a3d-4154-b746-1591603f95d0` |
| TJ-only lead | `a1111111-1111-4111-8111-111111111107` |
| TJ-only member (selected) | `a1111111-1111-4111-8111-111111111108` |
| Team booking | `bcc84463-0ef0-428f-a721-c5f8725f3d36` |
| Team lead | `a1111111-1111-4111-8111-111111111101` |
| Team member A (edited) | `a1111111-1111-4111-8111-111111111108` |
| Team member B | `a1111111-1111-4111-8111-111111111103` |
| Harness admin actor | `11111111-1111-4111-8111-111111111199` |
| Synthetic team id (TJ seed) | `b1111111-1111-4111-8111-111111111204` |

Production cleaner `914b3acf-40e8-4ad5-a5a2-9e2de711849a` was **not** written; used only as historical defect-class reference.

## 5–8. Before / actions / after / SQL

### Fixture pattern (T1 / T2 / T10)

Before seed (booking original restored after run):

- `is_team_job=false`, lead hybrid null, no summary, no TJ rows
- Seeded lead-only `earnings_summary` @ 25000; lead hybrid 25000; member **only** in `team_job_member_payouts` @ 15000; member absent from roster

Action: `adjustVisitPayoutEarnings` → member `18000`.

After:

| Check | Result |
|-------|--------|
| Classifier | `per_cleaner` |
| API | `{ ok: true, mode: "per_cleaner" }` |
| Office allocation (canonical resolver) | 18000 |
| `team_job_member_payouts` | 18000 |
| `earnings_summary` member row | 18000 |
| Lead `cleaner_payout_cents` / `display_earnings_cents` | 25000 unchanged |
| Lead office allocation | 25000 unchanged |

### T3 true team

Seeded three TJ + summary allocations (60k / 50k / 40k). Edited member A → 55k. Peers unchanged; lead hybrid 60k unchanged.

### T4 maker–checker

`PAYOUT_MAKER_CHECKER=true`; `withEarningsAdjustMakerChecker` returned `{ mode: "proposed", proposalId: … }`; TJ amount unchanged (18000→18000). Apply callback not invoked.

### T5 open batch

Required booking `status=completed` and `is_test=false` for sync inclusion (see residual risks). Pending batch for member; TJ `status=batched`; edit to 20000 → batch `total_amount_cents=20000`, API `batchTotalCents=20000`.

### T8 locked

Linked team booking to `cleaner_payouts.status=approved` with `payout_status=eligible` + `payout_frozen_cents`. Edit rejected with `code=payout_batch_locked`; TJ rows unchanged.

### Representative SQL (identity / safety)

```sql
SELECT count(*) FROM public.payout_transfer_outbox;
SELECT count(*) FROM public.payout_transfers;
-- Staging inventory
SELECT (SELECT count(*) FROM bookings) AS bookings,
       (SELECT count(*) FROM team_job_member_payouts) AS tj;
```

Harness: `apps/web/lib/payout/__tests__/payoutE2e001PhaseA.staging.verify.test.ts` with `STAGING_VERIFY=1`.

## 9. API responses (service layer)

Examples from harness evidence:

```json
{ "ok": true, "payoutId": null, "batchTotalCents": null, "mode": "per_cleaner" }
```

```json
{ "ok": true, "mode": "proposed", "proposalId": "57833308-dfd8-4ecd-bd42-6cb6dbc76f38" }
```

```json
{ "ok": true, "payoutId": null, "batchTotalCents": 20000, "mode": "per_cleaner" }
```

```json
{
  "ok": false,
  "error": "Payout batch is approved or paid; visit earnings cannot be edited.",
  "code": "payout_batch_locked"
}
```

## 10. UI observations

| Surface | Status |
|---------|--------|
| Deployed Preview earnings UI | **BLOCKED** — Preview has no Supabase; `/api/health` was 401 without browser session; health JSON confirmed empty DB config |
| Staging-branch Vercel alias | Not running Phase A commit |
| Office panel pending copy (code review) | `OfficeCleanerEarningsEditPanel` treats `requires_approval` / `applied===false` as pending and toasts *“Proposed … amounts are unchanged until approved”* without incrementing saved/Updated when pending-only |

Live admin toast / cleaner dashboard click-path **not** executed against a configured deployment.

## 11. Application logs

Harness used service-role path; system log / admin earnings action writes are best-effort alongside fail-closed `payout_audit_events`. No Paystack / transfer worker logs observed (outbox empty).

## 12. Audit-event evidence

Example durable row after applied T1 edit:

| Field | Value |
|-------|-------|
| id | `4e5e9935-ad1b-49e8-8c13-4ba934eeb887` |
| event_type | `visit_earnings_adjusted` |
| booking_ids | `[04ee8cad-…]` |
| actor_user_id | `11111111-1111-4111-8111-111111111199` |
| new_values | `mode=per_cleaner`, cleaner_id=member, payout/total 18000 |
| context.adjustment_note | `PAYOUT-E2E-001 Phase A staging verify T1` |

**Note:** `old_values.total_cents` recorded `25000` (hybrid fallback via `resolveCleanerDashboardEarningsCents`) while prior TJ member amount was `15000`. Audit event exists and fails closed on insert failure (code review of `requireVisitEarningsAdjustAudit`); old-amount accuracy for TJ-only members is a residual risk.

**T6 fail-closed path:** unit coverage for RAW mismatch PASS; audit fail-closed verified by implementation review (returns `audit_persist_failed`, does not report success). No staging permission sabotage performed.

## 13. Batch reconciliation

| Metric | Before | After edit (20000) |
|--------|-------:|-------------------:|
| Open batch `total_amount_cents` | 18000 | 20000 |
| API `batchTotalCents` | — | 20000 |
| Office member allocation | 18000 | 20000 |

## 14. Cross-surface reconciliation (T9, post T5)

| Surface/source | Before | Expected after | Actual after | Result |
| ----------------------- | -----: | -------------: | -----------: | ------ |
| Office visit allocation | 15000 → 18000 → 20000 | 20000 | 20000 | PASS |
| Earnings summary (member) | missing → 18000 | 20000 | 20000 | PASS |
| Team-member payout row | 15000 | 20000 | 20000 | PASS |
| Lead hybrid fields | 25000 | 25000 | 25000 | PASS |
| Open batch total | 18000 | 20000 | 20000 | PASS |
| Audit event | n/a | present on applied | present | PASS |
| Cleaner-facing UI | n/a | n/a | not exercised live | BLOCKED |
| Office period UI | n/a | n/a | not exercised live | BLOCKED |
| Roster member row | n/a | n/a | not present on fixture | N/A |

## 15. Deviations and limitations

1. **PR Preview cannot run payout APIs** — missing Supabase env for non-`staging`/`development` git branches.
2. Behavioral mutations executed via **local Phase A code @ `c2baebc` + staging DB**, not via the Preview HTTP edge.
3. **UI toast / cleaner dashboard** not live-verified on a configured host.
4. Staging seed data was sparse (0 TJ rows initially); fixtures were created and **restored** (`tj=0`, `cleaner_payouts=0` after cleanup).
5. T5 required temporarily setting booking `completed` + `is_test=false` because batch sync filters those predicates.
6. Roster-member payout rail not populated on the TJ-only fixture (code path covered by unit tests / team writer, not this staging row).

## 16. Residual risks

| ID | Risk | Severity |
|----|------|----------|
| R1 | PR Preview misconfigured for payout verification until branch-scoped staging env is attached | High (ops) |
| R2 | `syncPayoutBatchFromBookings` TJ inclusion requires `bookings.status=completed` and `is_test=false` — batched non-completed visits sync to 0 | Medium |
| R3 | Audit `old_values.total_cents` may use hybrid fallback for TJ-only members lacking summary entry pre-edit | Low |
| R4 | Multi-table writes are sequential (not a single DB transaction); RAW + audit fail-closed reduce false success but partial writes remain possible | Medium |
| R5 | Batch period heuristic: open batches matched by cleaner + date-in-period (collision if overlapping open periods) | Low–Med |
| R6 | Concurrent edits / idempotency not load-tested on staging | Low |
| R7 | Live `PAYOUT_MAKER_CHECKER` value on staging-branch deployment not decrypted in this session (encrypted in Vercel); harness forced the flag | Low |

### Technical review (Phase A only)

| Topic | Observation |
|-------|-------------|
| Classifier ambiguity | Multi-signal; fail-closed to `per_cleaner` when TJ/roster/summary/multi-roster signals present |
| Transactions | No multi-table transaction; compensation via RAW + audit fail-closed |
| RAW resolver | Uses `perCleanerAllocationsForBooking` (office canonical) |
| API applied vs pending | Route distinguishes `requires_approval` / `applied`; panel pending toast fixed |
| Authorization | Admin API still gated by `requireAdminApi` (not re-tested live) |
| Currency | Integer cents throughout |

## 17. Final gate decision

### Test matrix status

| Test | Result | Evidence basis |
|------|--------|----------------|
| T1 TJ-only non-team | **PASS** | Staging harness |
| T2 no lead overwrite | **PASS** | Staging harness |
| T3 true team | **PASS** | Staging harness |
| T4 maker–checker pending | **PASS** (service) / **BLOCKED** (live UI) | Harness + code review |
| T5 open batch sync | **PASS** | Staging harness |
| T6 audit durability | **PASS** (applied row) / fail-closed by code+unit design | Staging + review |
| T7 RAW mismatch | **PASS** | Unit test |
| T8 locked records | **PASS** | Staging harness (`payout_batch_locked`) |
| T9 cross-surface | **PASS** (DB/office resolver) / UI surfaces blocked | Staging harness |
| T10 defect-class fixture | **PASS** | Staging harness |

### Decision: **CONDITIONAL PASS**

Financial-integrity controls for Phase A **pass** on staging database evidence at commit `c2baebc`. Remaining gaps are **non-financial for the writer path** but **operational for release**: Preview lacks DB config, and live office/cleaner UI was not exercised on a configured host.

**Production: NO-GO. PR #76 remains draft / unmerged.**

### Recommended next authorization

1. Attach **Preview (git branch = Phase A branch)** env vars copying staging Supabase + `SHALEAN_APP_ENV=staging` + known `PAYOUT_MAKER_CHECKER` (or redeploy verification on `staging` branch **after** an explicitly authorized staging-only integration, still without production promote).
2. Re-run office UI matrix (T4 toast, T9 cleaner dashboard) on that configured host.
3. Optionally harden R2/R3 in a follow-up (still Phase A or early Phase B) before production authorization.
4. Only after UI confirmation + explicit production authorization: mark PR ready, merge, promote.
