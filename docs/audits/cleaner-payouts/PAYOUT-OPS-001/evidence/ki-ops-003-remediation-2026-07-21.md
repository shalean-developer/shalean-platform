# PAYOUT-OPS-001 — KI-OPS-003 remediation (2026-07-21)

| Field | Value |
|-------|-------|
| **Issue** | KI-OPS-003 — Duplicate rejection audit events on idempotent retry |
| **Mode** | Remediation + non-production verification |
| **Commit** | `599823fae9a25144ac7b4ff73b6dbd60c54a1ee4` |
| **Preview** | `https://shalean-platform-mxqlvlgxs-shalean-cleaning-services.vercel.app` |
| **Deployment** | `dpl_DMFMxwEwsQKWJC9p2Nzbg3wYJQzC` |
| **Staging** | `gbgnemlpyykyhpqqbgru` |
| **Raw** | `evidence/ki-ops-003-remediation-raw-2026-07-21.json` |
| **Harness** | `scripts/env/payout-ops-001-ki-ops-003-remediation-verify.mjs` |
| **Prior FAIL evidence (preserved)** | `evidence/ki-ops-002-003-verification-2026-07-21.md` |

## Root cause

`rejectMoneyActionProposal` inserted `visit_earnings_adjustment_rejected` on every successful RPC response, including when `already_processed: true`. Concurrent losers and sequential retries therefore duplicated audit rows even though the proposal transition and earnings remained correct.

## Idempotency design

1. **RPC** `reject_admin_money_action_proposal` returns `transition_applied: true` only when this call wins the conditional `pending → rejected` UPDATE; already-rejected / concurrent losers return `transition_applied: false` with `already_processed: true` (no overwrite of checker, note, or `reviewed_at`).
2. **Application** inserts the reject audit **only** when `transitionApplied === true`. Already-processed responses never write audit.
3. **Database** unique partial index `payout_audit_events_vea_rejected_ref_uidx` on `reference` where `event_type = 'visit_earnings_adjustment_rejected'`, with deterministic `reference = vea_rejected:<proposal_id>`. Concurrent double-insert races hit 23505 and are treated as exactly-once success. Other event types for the same proposal remain allowed.

Migration: `supabase/migrations/20260721140000_payout_ops_001_reject_audit_idempotency.sql` (applied to staging).

## Automated tests

```bash
cd apps/web
npx vitest run lib/payout/__tests__/payoutOps001Approvals.test.ts
npx vitest run lib/booking/refund/__tests__/princessPrdRefundContract.test.ts lib/payout/__tests__/payoutSafetyGuards.test.ts
npm run typecheck
```

| Suite | Result |
|-------|--------|
| `payoutOps001Approvals.test.ts` | **17/17 passed** (includes KI-OPS-003 first/retry/concurrent/multi/unique-violation + migration contract) |
| `princessPrdRefundContract.test.ts` | **29/29 passed** |
| `payoutSafetyGuards.test.ts` | **2/2 passed** |
| `npm run typecheck` | **passed** |

## Sequential verification

| Field | Value |
|-------|-------|
| Proposal | `f0d3a069-2826-48f6-9451-05bcea3a4d38` |
| Reject #1 | `200`, `already_processed: false` |
| Reject #2 | `200`, `already_processed: true` |
| Checker / note / `reviewed_at` | **unchanged** after retry |
| Earnings | **unchanged** (15000) |
| Approve after reject | **blocked** (`409 proposal_already_rejected`) |
| Reject audit events | **1** (`vea_rejected:f0d3a069-…`) |
| Verdict | **PASS** |

## Concurrent verification (2)

| Field | Value |
|-------|-------|
| Proposal | `42e53b76-3cea-4b2d-8c52-a442a5eef94a` |
| Responses | 1 winner (`already_processed: false`), 1 loser (`true`) |
| Terminal row | single `rejected` |
| Earnings | **unchanged** |
| Reject audit events | **1** |
| Verdict | **PASS** |

## Multi-concurrent verification (4)

| Field | Value |
|-------|-------|
| Proposal | `13071d79-f056-43bb-829d-68ceefa80e6b` |
| Winners / losers | 1 / 3 |
| Reject audit events | **1** |
| Earnings | **unchanged** |
| Verdict | **PASS** |

## Audit row counts (post-remediation)

| Scenario | Count |
|----------|-------|
| Sequential after retry | **1** |
| Concurrent (2) | **1** |
| Multi-concurrent (4) | **1** |

## Governance

**PASS — KI-OPS-003 remediated and ready for separate production authorization**

Package-level production authorization remains subject to remaining known issues (e.g. KI-OPS-001 approve audit `proposal_id`). No production merge or deploy performed in this session.

KI-OPS-003 reject-audit idempotency remediation and non-production verification completed. No production merge, production deployment, production financial mutation, feature-flag weakening, or unrelated finance workflow change performed.
