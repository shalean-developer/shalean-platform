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

---

## Conditions attached to implementation authorization

1. Approve applies **immutable** `admin_money_action_proposals.payload` (SEC-OPS-001).
2. Approve/reject use **atomic pending claim** (SEC-OPS-002).
3. Reject endpoint + required reason ship in the same package as Approve UI.
4. `PAYOUT_MAKER_CHECKER` remains `true`; self-approve remains off.
5. No production deploy from this package without a separate production gate.
6. Refund workflow must remain regression-tested and unchanged in behaviour.
