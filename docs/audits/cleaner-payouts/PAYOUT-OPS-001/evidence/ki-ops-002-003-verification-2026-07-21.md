# PAYOUT-OPS-001 — KI-OPS-002 & KI-OPS-003 verification

| Field | Value |
|-------|-------|
| **Date** | 2026-07-21 |
| **Mode** | Verify only — **no application code changes** |
| **Preview** | `shalean-platform-rdemww8pd-…vercel.app` @ `a533794…` |
| **Staging** | `gbgnemlpyykyhpqqbgru` |
| **Raw** | `evidence/ki-ops-002-003-verify-raw-2026-07-21.json` |
| **Harness** | `scripts/env/payout-ops-001-ki-ops-002-003-verify.mjs` |

## KI-OPS-002 — Original amount snapshot

Located the successful solo visit-earnings proposal created by the operator test (maker `staging-admin@…`, checker-approved).

| Field | Value |
|-------|-------|
| Proposal ID | `4db13e7e-2fc8-456e-8675-b4c5c9c92577` |
| Action type | `adjust_payout_earnings` |
| Status | `approved` |
| Canonical pre-change (approve audit `old_values.total_cents`) | **30000** |
| Stored `original_total_cents` | **30000** |
| Stored `original_payout_cents` | 30000 |
| Stored proposed (`payout_cents` + `bonus_cents`) | **20000** |
| Computed delta | **-10000** |
| `snapshot_at` | `2026-07-21T11:38:43.696Z` |

### Expected shape vs observed

The verification brief used **R300 → R250** as the expected shape (`30000` / `25000` / `-5000`).  
No proposal with that exact pair exists. The successful operator proposal is **R300 → R200**:

| | Expected (brief example) | Observed (actual proposal) |
|--|--------------------------|----------------------------|
| original | 30000 | **30000** |
| proposed | 25000 | **20000** |
| delta | -5000 | **-10000** |

### Verdict: **PASS**

`original_total_cents` matches the canonical pre-change amount (30000), corroborated by the apply-time audit. It is not `0`, missing, or stale relative to that change.

**Note:** Team-job fixture proposals on booking `04ee8cad-…` still often store `original_total_cents: 0` (separate path). This verify scoped to the successful solo visit-earnings row above.

---

## KI-OPS-003 — Reject audit idempotency

Controlled non-production proposals on staging fixture booking `04ee8cad-…` (member earnings held at 15000). Checker: `info@shalean.com`.

### Sequential reject

| Step | Result |
|------|--------|
| Propose | `d45d1d50-38cf-476e-ba5b-5619216c69c0` pending |
| Reject #1 | `200` → `rejected`; review note A; `reviewed_at` set |
| Reject #2 (retry) | `200` `already_processed: true` |
| Proposal after retry | status / checker / note / `reviewed_at` **unchanged** |
| Earnings | **unchanged** (15000) |
| Approve after reject | **blocked** (`409 proposal_already_rejected`) |
| Reject audit events | **2** |

**Verdict: FAIL** — duplicate reject audit on sequential retry.

### Concurrent reject (fresh proposal)

| Step | Result |
|------|--------|
| Propose | `d76df02e-5acd-4ef2-8933-3d287ed922b6` |
| Two parallel reject POSTs | one winner (`already_processed: false`), one idempotent (`true`) |
| Proposal | single `rejected`; first review note retained |
| Earnings | **unchanged** |
| Reject audit events | **2** |

**Verdict: FAIL** — duplicate reject audit under concurrency.

### Prior sample

Proposal `8823bfad-…` from earlier app-path verify also has **2** reject audit events.

### Overall KI-OPS-003: **FAIL**

Root cause (inspection only): `rejectMoneyActionProposal` always inserts `visit_earnings_adjustment_rejected` even when RPC returns `already_processed: true`. No code changed in this session.

---

## Package update

| Issue | Prior disposition | Verified 2026-07-21 |
|-------|-------------------|---------------------|
| KI-OPS-002 | Suspected FAIL on TJ fixtures | **PASS** for operator solo R300 proposal; TJ `0` snapshot still open as residual path |
| KI-OPS-003 | Suspected FAIL | **FAIL** confirmed (sequential 2, concurrent 2) |
