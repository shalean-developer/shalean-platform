# PAYOUT-OPS-001 — Security control evidence (implementation)

| Control | Evidence |
|---------|----------|
| Immutable payload | `approveMoneyActionProposal.ts` applies `parseEarningsAdjustPayload(proposal.payload)` only; approve route rejects financial body keys (`approval_body_forbidden_fields`) |
| Atomic claim | Migration RPC `claim_admin_money_action_proposal` conditional `UPDATE … WHERE status='pending'` |
| Self-approve blocked | Claim/reject RPCs compare `proposed_by` vs actor unless `PAYOUT_ALLOW_SELF_APPROVE` (unset) |
| Fail-closed after claim | Apply failure → `failed` status, not silent `pending` |
| Reject no mutate | `rejectMoneyActionProposal` never calls `adjustVisitPayoutEarnings` |
| Duplicate open | Unique index `admin_money_action_proposals_one_open_uidx` + `proposal_duplicate_pending` |
| Admin auth | All new routes use `requireAdminApi` |
| Flag | Server-side `PAYOUT_MAKER_CHECKER` only; not changed by this package |
| Audit | Approve uses existing fail-closed visit adjust audit; reject inserts `visit_earnings_adjustment_rejected` |

## Residual

- Live staging concurrency + two-admin UI evidence still open (see implementation-summary).
- Stuck `processing` rows need ops procedure.
