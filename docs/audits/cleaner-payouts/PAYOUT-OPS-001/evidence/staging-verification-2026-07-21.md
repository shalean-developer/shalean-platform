# PAYOUT-OPS-001 — Staging verification (2026-07-21)

| Field | Value |
|-------|-------|
| **Staging Supabase** | `gbgnemlpyykyhpqqbgru` |
| **PR** | https://github.com/shalean-developer/shalean-platform/pull/78 |
| **Branch** | `feat/payout-ops-001-office-approvals` |

## Migration

1. Deduped older open proposals (expired duplicates) so unique index could apply.
2. Applied `20260721120000_payout_ops_001_money_action_proposal_claim.sql` via `supabase db query --linked`.
3. Object check: `claim_fn=1`, `reject_fn=1`, `uniq_idx=1`, `queue_idx=1`.

## Concurrent claim (T11 DB)

| Attempt | Result |
|---------|--------|
| First claim (checker A) | `claimed: true`, status `processing` |
| Second claim (checker B) | `claimed: false`, `code: proposal_not_pending` |
| Earnings mutation | **Not applied** (probe cleaned to `failed`) |

Proposal id probe: `f23a0d12-9030-4569-b4a6-c48d7150a4c1` (fixture only).

## Still outstanding for PASS

- Preview deploy healthy with app code
- Two distinct Office admin UI sessions: propose → list → approve; propose → reject
- Screenshots
- Live audit event inspection after real approve path (via app, not SQL-only claim)

## Gate

**CONDITIONAL PASS** — staging DB controls (atomic claim + indexes) verified; full Office two-admin E2E still required.
