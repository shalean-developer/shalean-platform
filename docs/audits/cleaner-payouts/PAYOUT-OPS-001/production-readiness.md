# PAYOUT-OPS-001 — Production readiness

| Field | Value |
|-------|-------|
| **Date** | 2026-07-21 |
| **Package gate** | **PASS — Approved for production deployment** |
| **Production authorization** | **GRANTED** (operator approval 2026-07-21) |
| **Production merge** | Authorized — PR #78 → `main` |
| **Production deploy** | Authorized under normal change-management controls |

## PASS checklist status

| Requirement | Status |
|-------------|--------|
| Green CI | **Met** |
| Healthy deployed application | **Met** (Preview → staging; production pending post-deploy verify) |
| Two-admin approve evidence | **Met** |
| Two-admin reject evidence | **Met** |
| Self-approval block | **Met** |
| Exactly-once mutation | **Met** |
| Reject audit exactly-once (KI-OPS-003) | **Met** |
| Database lifecycle rows | **Met** (staging); production migrations required at deploy |
| Audit-event rows with proposal id | **Accept residual KI-OPS-001** — approve mutation audit may omit `proposal_id`; proposal row retains maker/checker linkage |
| Screenshots | **Met** |
| Regression results | **Met** |
| Rollback confirmation | **Met** (`rollback-procedure.md`) |
| Feature flags unchanged | **Required at deploy:** `PAYOUT_MAKER_CHECKER=true`; `PAYOUT_ALLOW_SELF_APPROVE` unset/false |

## Production deploy controls (binding)

1. Merge PR #78 to `main` only after green required checks.
2. Apply forward migrations to production Supabase (`tchayecuvzssixyxlvfu`) before or with app cutover:
   - `20260721120000_payout_ops_001_money_action_proposal_claim.sql`
   - `20260721140000_payout_ops_001_reject_audit_idempotency.sql`
3. Deploy production app; confirm `SHALEAN_APP_ENV=production` and staging-bound Preview is not promoted as prod.
4. Post-deploy verify: health, Approvals route availability, claim/reject RPC presence, flags unchanged.
5. Do **not** mutate live cleaner earnings as part of smoke unless a controlled ops fixture is separately authorized.
6. Keep rollback readiness: UI/API revert path; never disable maker–checker or enable self-approve.

## Accepted residuals (non-blocking for this authorization)

| ID | Note |
|----|------|
| KI-OPS-001 | Approve apply audit may omit `context.proposal_id`; linkage via proposal table |
| KI-OPS-002 | TJ fixture path may still snapshot `original_total_cents=0`; operator solo path verified PASS |
| KI-OPS-005 | Empty-state copy cosmetic |

## Rollback reminder

Fast path: remove Approvals UI/routes; keep maker–checker **on**. Never “rollback” by disabling maker–checker or enabling self-approve.
