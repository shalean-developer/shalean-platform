# PAYOUT-OPS-001 — Decision log

| Date | Decision | Rationale | Status |
|------|----------|-----------|--------|
| 2026-07-21 | Open PAYOUT-OPS-001 as operational UX gap separate from Phase A PASS | Financial control works; Office cannot complete checker step | Accepted |
| 2026-07-21 | Do **not** disable `PAYOUT_MAKER_CHECKER` to compensate for missing UI | Would weaken control; violates governance | Binding |
| 2026-07-21 | Do **not** enable `PAYOUT_ALLOW_SELF_APPROVE` | Segregation of duties | Binding |
| 2026-07-21 | Place UX at `/office/payouts/approvals` (dedicated page) | Avoid overcrowding payouts hub; keep finance domain scoped | Accepted (design) |
| 2026-07-21 | Defer global multi-domain approvals inbox | Scope control; expenses already have own list | Accepted (design) |
| 2026-07-21 | Add list + reject APIs; harden approve to stored payload + atomic claim | Existing approve API insufficient for safe Office workflow | Binding for implementation |
| 2026-07-21 | Prefer payload JSON snapshot for original amounts over mandatory migration | Faster; reversible; enough for v1 | Accepted (design) |
| 2026-07-21 | Optional queue index migration when authorized | Performance; not a functional blocker for staging | Conditional |
| 2026-07-21 | Notifications to proposer are phase 5, not v1 blocker | Queue + toast sufficient for operational close | Accepted |
| 2026-07-21 | Analysis-only authorization; no implementation in this session | Work package governance | Binding |
| 2026-07-21 | Governance outcome: **CONDITIONAL PASS — Ready for implementation authorization subject to stated conditions** | Design complete; SEC-OPS-001/002 must ship with implementation | Recommended |
| 2026-07-21 | Implementation landed on `feat/payout-ops-001-office-approvals` / PR #78 | Immutable payload approve, atomic claim RPCs, reject API, Approvals UI | Accepted |
| 2026-07-21 | Staging Preview app-path + two-admin UI verification executed | Preview `a533794…` → staging Supabase; maker/checker distinct admins | Accepted |
| 2026-07-21 | Verification gate: **CONDITIONAL PASS — Specific evidence or remediation remains** | Controls proven; KI-OPS-001 approve audit lacks `proposal_id`; KI-OPS-002 original snapshot UX; KI-OPS-003 duplicate reject audit | Binding until remediated or explicitly waived at production gate |
| 2026-07-21 | No production merge, production deploy, or flag weakening | Governance | Binding |
| 2026-07-21 | KI-OPS-002 verify-only: **PASS** on operator solo proposal `4db13e7e` (`original_total_cents=30000`) | Canonical pre-change matched approve audit; actual change was R300→R200 not R250 | Accepted |
| 2026-07-21 | KI-OPS-003 verify-only: **FAIL** (sequential 2 audits, concurrent 2 audits) | `already_processed` reject path still inserts audit | Binding for remediation |
| 2026-07-21 | KI-OPS-003 remediated: gate audit on RPC `transition_applied` + unique `vea_rejected:<proposal_id>` index | Winner-only audit write; DB enforces exactly-one under concurrency | Accepted |
| 2026-07-21 | KI-OPS-003 non-prod verify: sequential/concurrent/multi each **1** reject audit @ `599823fa` Preview | Staging migration applied; prior FAIL evidence preserved | **PASS — KI-OPS-003 remediated** |
| 2026-07-21 | No production merge, production deploy, or flag weakening for KI-OPS-003 | Governance | Binding |
| 2026-07-21 | **Production deployment authorized** for PAYOUT-OPS-001 (PR #78) | Design, implementation, KI-OPS-003 remediation, non-prod verification complete; residuals KI-OPS-001/002/005 accepted as non-blocking | Binding |
| 2026-07-21 | Accept KI-OPS-001 residual (approve audit may omit proposal_id) at production gate | Proposal row retains maker/checker; financial controls proven | Accepted |
| 2026-07-21 | Production flags must remain `PAYOUT_MAKER_CHECKER=true`, self-approve off | Segregation of duties | Binding |
| 2026-07-21 | PR #78 merged to `main`; production migrations applied; production app deployed @ `f628bf0b` | Change control + post-deploy health verify | **PASS — Production deployed** |
| 2026-07-21 | Expired 13 duplicate open production proposals before `one_open_uidx` (newest kept; no earnings mutate) | Required for unique open-index migration safety | Accepted |

---

## Conditions attached to implementation authorization

1. Approve applies **immutable** `admin_money_action_proposals.payload` (SEC-OPS-001).
2. Approve/reject use **atomic pending claim** (SEC-OPS-002).
3. Reject endpoint + required reason ship in the same package as Approve UI.
4. `PAYOUT_MAKER_CHECKER` remains `true`; self-approve remains off.
5. No production deploy from this package without a separate production gate.
6. Refund workflow must remain regression-tested and unchanged in behaviour.
