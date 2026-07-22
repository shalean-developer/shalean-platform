# PAYOUT-OPS-001 — Production deployment evidence (2026-07-21)

| Field | Value |
|-------|-------|
| **Authorization** | Operator APPROVED FOR PRODUCTION DEPLOYMENT (2026-07-21) |
| **PR** | https://github.com/shalean-developer/shalean-platform/pull/78 — **MERGED** |
| **Merge commit** | `f628bf0b8f31deacfda83bd2b2cb2bbdeda332ef` |
| **Production deployment** | `dpl_J1bxVbjXKtUPw2cb3E6sZySezjcH` |
| **Aliases** | `https://shalean.co.za`, `https://www.shalean.co.za` |
| **Production Supabase** | `tchayecuvzssixyxlvfu` |

## Change-control sequence

1. Docs authorization recorded on feature branch; CI green.
2. Merged PR #78 → `main` (`f628bf0b`).
3. Production DB prep: expired **13** older duplicate open proposals (newest retained per booking/action/cleaner) so unique open index could apply — **no earnings mutation**.
4. Applied migrations to production:
   - `20260721120000_payout_ops_001_money_action_proposal_claim.sql`
   - `20260721140000_payout_ops_001_reject_audit_idempotency.sql`
5. Confirmed objects: `claim_fn=true`, `reject_fn=true`, `one_open_uidx`, `queue_idx`, `vea_rejected_ref_uidx`, `transition_applied` present.
6. Re-linked CLI to staging after production migrate.
7. Confirmed / set `PAYOUT_MAKER_CHECKER=true` on Production (and Preview); `PAYOUT_ALLOW_SELF_APPROVE` remains absent.
8. Production redeploy from `main` @ `f628bf0b` with env applied (`dpl_J1bxVbjXKtUPw2cb3E6sZySezjcH`).

## Post-deploy verification (non-mutating)

| Check | Result |
|-------|--------|
| `GET /api/health/environment` | `status=ok`, `shaleanAppEnv=production`, `vercelEnv=production` |
| `gitBranch` | `main` |
| `gitSha` | `f628bf0b8f31deacfda83bd2b2cb2bbdeda332ef` |
| Supabase ref | `tchayecuvzssixyxlvfu` (matches expected) |
| `issues` | `[]` |
| `/office/payouts/approvals` | Redirects to login (route live) |
| `GET /api/admin/money-action-proposals` | `401` (auth gate live) |
| Live earnings mutation smoke | **Not performed** (no production financial mutation authorized beyond migration hygiene) |

## Flags

| Flag | Production |
|------|------------|
| `PAYOUT_MAKER_CHECKER` | `true` (confirmed set) |
| `PAYOUT_ALLOW_SELF_APPROVE` | absent / off |

## Rollback readiness

See `../rollback-procedure.md`. Fast path: hide Approvals UI / revert merge deploy; keep maker–checker **on**; leave RPCs/indexes in place unless replaced by a forward migration.

## Gate

**PASS — Production deployed and post-deploy verified**
