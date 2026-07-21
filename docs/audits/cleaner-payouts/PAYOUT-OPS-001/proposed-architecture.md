# PAYOUT-OPS-001 — Proposed architecture

| Field | Value |
|-------|-------|
| **Work package** | PAYOUT-OPS-001 |
| **Status** | Design only — not authorized for implementation |
| **UX placement decision** | Dedicated page `/office/payouts/approvals` (see `ux-workflow.md`) |

---

## 1. Goals

Complete the Office operational loop for visit-earnings maker–checker **without** weakening controls:

1. Second admin discovers pending proposals.
2. Reviews original vs proposed amounts and context.
3. Approves or rejects with audit trail.
4. Canonical earnings change **only** on successful approve of the **stored** proposal snapshot.

`PAYOUT_MAKER_CHECKER` remains `true`. No client-side earnings mutation.

---

## 2. Recommended placement

**Dedicated route:** `/office/payouts/approvals`

| Option | Verdict |
|--------|---------|
| Tab inside `/office/payouts` | Rejected — payouts page already dense (cleaners, batches, diagnostics) |
| Global Office approvals queue | Rejected for v1 — mixes expenses, refunds, reprice; higher scope |
| **Dedicated payouts approvals page** | **Selected** — scoped to money-action proposals; deep-linkable; matches Finance → Payouts hierarchy |

Nav: Finance → Payouts → Approvals (child link or secondary action from payouts header). Optional badge count of pending earnings proposals.

Reprice proposals (`reprice_booking_details`) may appear as a filterable type later; v1 focus: `adjust_payout_earnings` + `adjust_team_payout_earnings`.

---

## 3. Component architecture (proposed)

```text
/office/payouts/approvals/page.tsx
  └── OfficeMoneyActionApprovalsPage (client)
        ├── FiltersBar (type, status, cleaner, proposer, date range)
        ├── PendingProposalsTable
        │     └── ProposalRow → open Approve/RejectConfirmModal
        ├── EmptyState / LoadingState / UnauthorizedState
        └── toast + refresh

Libs (server):
  listMoneyActionProposals(...)
  approveMoneyActionProposal(...)  // claim → apply stored payload → mark approved
  rejectMoneyActionProposal(...)   // claim → mark rejected + review_note

APIs:
  GET  /api/admin/money-action-proposals
  GET  /api/admin/money-action-proposals/[id]   (optional detail)
  POST /api/admin/money-action-proposals/[id]/approve
  POST /api/admin/money-action-proposals/[id]/reject
```

Reuse existing writers (`adjustVisitPayoutEarnings`) behind approve. Prefer **new approve/reject endpoints** that apply **stored payload** rather than asking the UI to re-POST amounts to the legacy PATCH (see control hardening).

Legacy `PATCH …/adjust-payout-earnings` with `proposal_id` may remain for ops/API compatibility but must be hardened to the same immutable-payload + atomic-claim rules.

---

## 4. Control-preserving approve flow

```text
Checker Admin B
  → POST …/proposals/{id}/approve
  → requireAdminApi
  → SELECT proposal FOR UPDATE / conditional claim:
        UPDATE … SET status='approved', reviewed_by=B, reviewed_at=now()
        WHERE id=? AND status='pending' AND expires_at>now() AND proposed_by<>B
        RETURNING *
  → if 0 rows: 409 stale / self / expired / already processed
  → apply(adjustVisitPayoutEarnings) using **proposal.payload only**
  → if apply fails: compensate (revert status to pending OR mark failed — decide in phase 4; prefer fail-closed with compensating update)
  → audit already inside apply; additionally log proposal_id on audit context
```

**Hardening conditions (mandatory for implementation authorization):**

1. **Immutable snapshot:** apply uses `payload` from DB, ignore client amount fields on approve.
2. **Atomic claim:** conditional update on `status='pending'` before or as part of apply sequencing to prevent double-apply.
3. **Self-approve:** retain existing check; never enable `PAYOUT_ALLOW_SELF_APPROVE` in this package.
4. **No premature mutation:** propose path unchanged.
5. **Reject path:** set `rejected` + `review_note` without calling adjust writers.

---

## 5. Propose-path UX improvements (non-mutating)

In `OfficeCleanerEarningsEditPanel` (when authorized):

- Surface `proposal_id` in toast / copy link to `/office/payouts/approvals?highlight={id}`.
- Keep amounts unchanged until approved (already true).
- Optionally show “N pending for this cleaner” badge after reload (read-only query).

Do **not** optimistically display proposed amounts as stored earnings.

---

## 6. Data model sufficiency

Existing table is **mostly sufficient**. Recommended **optional** enrichments (migration only if authorized later):

| Change | Need |
|--------|------|
| Snapshot `original_payout_cents` / `original_bonus_cents` / `original_total_cents` in payload at propose | Strongly recommended for UX + audit (can be JSON-only, no column) |
| Index `(status, created_at DESC)` WHERE pending | Recommended for queue list performance |
| Unique partial index preventing duplicate pending per (booking_id, action_type, cleaner_id) | Optional product decision — design recommends soft policy: warn / supersede older pending |
| `cancelled` status | Optional — proposer cancel; not required for v1 if reject covers checker |

**No schema change is strictly required** if original amounts are computed at list time from current booking rows + payload — but that is weaker (canonical may have changed via another approve). Prefer snapshot-at-propose in payload.

---

## 7. Notifications

v1 minimum: Office toast for checker after approve/reject; proposer sees outcome on next visit to Approvals or payouts (filter “my proposals”).

v1.1 (phase 5): email/in-app notify proposer (pattern: `sendFinanceApprovalEmails` for expenses). Out of critical path for design PASS.

---

## 8. Out of scope

- Disabling `PAYOUT_MAKER_CHECKER`
- Refund queue redesign
- Expense workflow changes
- Production deploy / flag changes
- Ledger / Zoho / payout regeneration
