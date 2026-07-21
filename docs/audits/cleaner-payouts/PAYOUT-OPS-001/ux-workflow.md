# PAYOUT-OPS-001 — UX workflow

| Field | Value |
|-------|-------|
| **Work package** | PAYOUT-OPS-001 |
| **Selected IA** | Dedicated page `/office/payouts/approvals` |

---

## 1. Placement decision

**Choose: dedicated `/office/payouts/approvals` page.**

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Tab on `/office/payouts` | Proximity to edit | Payouts UI already overloaded; hard to find | No |
| Global Office approvals | One inbox | Cross-domain scope creep (expenses/refunds) | Later / no for v1 |
| **Dedicated payouts approvals** | Clear ownership; deep links; badgeable | Extra route | **Yes** |

Entry points:

- Finance nav: under Payouts, “Pending approvals” with pending count badge.
- Header link from `/office/payouts`.
- Post-propose toast: “View pending approvals” → deep link with `?highlight=`.

---

## 2. Pending approvals list

### Columns

| Column | Source |
|--------|--------|
| Proposal ID (truncated + copy) | `id` |
| Type | `action_type` label |
| Status | `status` (default filter: pending) |
| Cleaner | Join via `payload.cleaner_id` / booking owner |
| Visit / booking | `booking_id` + customer name + date |
| Original earnings | Snapshot or live resolve (prefer snapshot) |
| Proposed earnings | `payload.payout_cents + bonus_cents` |
| Difference (ZAR) | proposed − original |
| Reason | `payload.adjustment_note` |
| Proposer | `proposed_by_email` / profile |
| Proposed at | `created_at` |
| Expires | `expires_at` |
| Actions | Approve / Reject (pending + authorized + not self) |

### Filters

- Proposal type (`adjust_payout_earnings`, `adjust_team_payout_earnings`, optional reprice)
- Status (`pending` default; also approved/rejected/expired for audit browsing)
- Cleaner (search/select)
- Proposer (search/select)
- Date range on `created_at`

### Pagination

Cursor or page (`limit` default 25, max 100) ordered by `created_at DESC`.

---

## 3. States

| State | Behaviour |
|-------|-----------|
| Loading | Skeleton/table spinner |
| Empty | “No pending earnings approvals” + link back to Payouts |
| Unauthorized | 401/403 message; no actions |
| Success approve | Toast; row leaves pending filter; amounts update on payouts/cleaner views |
| Success reject | Toast; row status rejected |
| Failure | Inline/toast with server `code` (self-approve, expired, not pending, apply failed) |
| Stale / already processed | Disable actions; show status chip; refresh list |

---

## 4. Approve / Reject interaction

### Approve

1. Click Approve → confirmation modal:
   - Cleaner, booking link, original → proposed, Δ ZAR, reason, proposer, proposal_id, expires.
2. Confirm → `POST …/approve`.
3. On success: toast “Approved — earnings updated”; remove from pending.
4. On `maker_checker_self_approve`: toast explaining second admin required.
5. On stale: toast “Already processed”; refresh.

### Reject

1. Click Reject → modal with **required** rejection reason → maps to `review_note`.
2. Confirm → `POST …/reject`.
3. Earnings **unchanged**; status `rejected`.

Proposer’s own rows: Approve/Reject hidden or disabled with tooltip “You proposed this — another admin must review.”

---

## 5. Maker toast improvement (edit panel)

When propose succeeds:

> Proposed N visit(s) for second-admin approval — amounts unchanged until approved.  
> [View approvals] [Copy proposal id]

Do not show proposed amount as the stored total.

---

## 6. Wireframes (textual)

```text
┌─ Office › Payouts › Approvals ─────────────────────────────┐
│ Pending (3)  [Type ▾] [Cleaner] [Proposer] [From–To] [↻]   │
├────────────────────────────────────────────────────────────┤
│ Booking · Cleaner · R150 → R200 (Δ +R50) · Jane · 10:12   │
│ Reason: “Agreed rate correction”           [Approve][Reject]│
├────────────────────────────────────────────────────────────┤
│ …                                                          │
└────────────────────────────────────────────────────────────┘
```

---

## 7. Accessibility & safety

- Modals trap focus; destructive reject uses distinct confirm.
- Amounts tabular-nums; currency formatted ZAR.
- No auto-approve; no keyboard shortcut that skips confirm.
- Links open booking/cleaner in Office without leaving context if possible.
