# PAYOUT-OPS-001 — Implementation summary

| Field | Value |
|-------|-------|
| **Date** | 2026-07-21 |
| **Branch** | `feat/payout-ops-001-office-approvals` |
| **Authority** | Implementation + Preview/staging verification authorized; production merge/deploy **not** authorized |
| **Flag** | `PAYOUT_MAKER_CHECKER` unchanged (must remain `true`) |
| **Self-approve** | `PAYOUT_ALLOW_SELF_APPROVE` not enabled |

## Outcome

**CONDITIONAL PASS — Additional staging evidence or remediation required**

Implementation of Office pending approvals, immutable-payload approve, atomic claim, reject, list APIs, UI, migration, and automated unit tests is complete. Full two-admin Preview/staging live UI verification and staging migration apply remain required before production authorization.

## What shipped

1. Migration `20260721120000_payout_ops_001_money_action_proposal_claim.sql`
   - Statuses: `processing`, `failed`
   - Unique open-proposal index (booking + action + cleaner)
   - Queue indexes
   - RPCs: `claim_admin_money_action_proposal`, `reject_admin_money_action_proposal`
2. Lib: claim / approve / reject / list / payload parse; hardened `withMoneyActionMakerChecker`
3. APIs: `GET/POST` money-action-proposals (+ approve/reject); legacy PATCH approve ignores body financial fields
4. Office: `/office/payouts/approvals` + nav + deep-link toast path
5. Unit tests: `lib/payout/__tests__/payoutOps001Approvals.test.ts` (11 passed)
6. Refund regression: `princessPrdRefundContract.test.ts` (29 passed)

## Mandatory controls implemented

| Control | How |
|---------|-----|
| Immutable payload | `approveMoneyActionProposal` applies DB payload only; approve POST rejects financial body fields |
| Atomic claim | RPC `pending → processing` with conditional update |
| Fail-closed after claim | Apply failure → `failed` (not silent return to `pending`) |
| Reject | Atomic RPC; required note; no earnings mutation; audit event |
| Duplicate open proposals | Unique partial index + app pre-check `proposal_duplicate_pending` |
| Self-approve / self-reject | Blocked in claim/reject RPCs unless flag (flag stays off) |

## Duplicate-control documentation

**Chosen approach:** database unique partial index `admin_money_action_proposals_one_open_uidx` on `(booking_id, action_type, coalesce(payload->>'cleaner_id','')) WHERE status IN ('pending','processing')`, plus application-level pre-check returning `proposal_duplicate_pending` with `existing_proposal_id`.

## Known limitations

- Staging migration must be applied before Preview RPCs work against staging Supabase.
- Stuck `processing` rows (crash after claim, before terminal) need ops attention; not auto-reclaimed.
- Reprice approve still applies via caller `apply()` after claim (earnings path is payload-immutable).
- Two-admin live Office E2E screenshots pending Preview deploy + staging migration.
- Full T01–T23 concurrency DB tests require staging migration + service role harness.

## Rollback

1. Remove/disable Approvals nav + page (UI only).
2. Keep maker–checker flag `true`.
3. Do not drop migration in production without a forward fix; for Preview, redeploy prior commit.
4. Open `processing`/`failed` proposals: ops mark rejected with note if needed.

## Production-readiness recommendation

**Not ready for production authorization** until:

1. Migration applied on staging
2. Preview bound to staging with `PAYOUT_MAKER_CHECKER=true`
3. Two distinct admins complete propose → list → approve and propose → reject
4. Concurrent approve race proven against live RPC
5. Audit rows inspected for proposer + checker
