# PAYOUT-OPS-001 — Migration assessment

| Item | Detail |
|------|--------|
| File | `supabase/migrations/20260721120000_payout_ops_001_money_action_proposal_claim.sql` |
| Necessary? | **Yes** — atomic claim, reject RPC, `processing`/`failed` statuses, duplicate unique index, queue indexes |
| Destructive? | No (additive constraint widen + indexes + functions) |
| Production apply | **Not authorized** in this package |
| Staging apply | **Required** before Preview RPC verification |

## Objects

- CHECK status includes `processing`, `failed`
- Index `admin_money_action_proposals_queue_idx`
- Unique `admin_money_action_proposals_one_open_uidx`
- Function `claim_admin_money_action_proposal(uuid, uuid, boolean)`
- Function `reject_admin_money_action_proposal(uuid, uuid, text, boolean)`
- EXECUTE granted to `service_role` only
