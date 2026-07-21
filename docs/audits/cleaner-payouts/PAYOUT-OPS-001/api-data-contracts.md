# PAYOUT-OPS-001 — API & data contracts

| Field | Value |
|-------|-------|
| **Work package** | PAYOUT-OPS-001 |
| **Authority** | Contracts / pseudocode only — no migrations or code |

---

## 1. Sufficiency verdict

| Capability | Existing? | Gap |
|------------|-----------|-----|
| Propose | Yes — PATCH adjust without `proposal_id` | Payload should snapshot original amounts |
| Approve | Partial — PATCH with `proposal_id` | Must apply **stored payload**; atomic claim |
| Reject | Schema only | **Missing endpoint** |
| List pending | No | **Missing endpoint** |
| Detail | No | Optional GET by id |
| Pagination / filters | N/A | Required on list |

**Database:** table sufficient for v1. Prefer enriching `payload` at propose time (no migration). Optional index migration for queue performance when implementation authorized.

---

## 2. Existing approve contract (legacy)

`PATCH /api/admin/bookings/:id/adjust-payout-earnings`

**Propose body:**

```json
{
  "payout_cents": 20000,
  "bonus_cents": 0,
  "cleaner_id": "<uuid>",
  "adjustment_note": "optional"
}
```

**Propose response (200):**

```json
{
  "ok": true,
  "requires_approval": true,
  "applied": false,
  "proposal_id": "<uuid>",
  "edit_mode": "per_cleaner",
  "message": "…"
}
```

**Approve body (today):** same fields + `"proposal_id": "<uuid>"`.

**Hardening requirement:** when `proposal_id` set, ignore body amounts; apply `proposal.payload`; return 409 on mismatch if body amounts supplied and differ (defense in depth, like refunds).

---

## 3. Proposed list contract

`GET /api/admin/money-action-proposals`

**Query:**

| Param | Notes |
|-------|-------|
| `status` | default `pending`; multi via comma |
| `action_type` | optional |
| `cleaner_id` | optional |
| `proposed_by` | optional uuid |
| `booking_id` | optional |
| `from` / `to` | ISO dates on `created_at` |
| `limit` | default 25, max 100 |
| `cursor` | opaque (`created_at,id`) |

**Response item (required fields):**

```ts
type MoneyActionProposalListItem = {
  id: string;
  action_type: "adjust_payout_earnings" | "adjust_team_payout_earnings" | "reprice_booking_details";
  status: "pending" | "approved" | "rejected" | "expired";
  booking_id: string;
  booking: {
    date: string | null;
    customer_name: string | null;
    service: string | null;
  };
  cleaner_id: string | null;
  cleaner_name: string | null;
  original_total_cents: number | null; // from payload snapshot preferred
  proposed_payout_cents: number;
  proposed_bonus_cents: number;
  proposed_total_cents: number;
  difference_cents: number | null;
  adjustment_note: string | null;
  proposed_by: string;
  proposed_by_email: string | null;
  created_at: string;
  expires_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  can_review: boolean; // false if viewer is proposer or not pending
};
```

---

## 4. Proposed detail contract (optional)

`GET /api/admin/money-action-proposals/:id`

Returns list item + full `payload` + `can_review`. 404 if missing. Admin-only (no IDOR beyond admin allowlist — see security doc).

---

## 5. Proposed approve contract

`POST /api/admin/money-action-proposals/:id/approve`

**Body:** empty or `{ "confirm": true }` only — **no amount fields**.

**Success (200):**

```json
{
  "ok": true,
  "status": "approved",
  "proposal_id": "<uuid>",
  "applied": true,
  "payoutId": "<uuid>|null",
  "batchTotalCents": 12345,
  "edit_mode": "per_cleaner"
}
```

**Errors:**

| code | HTTP |
|------|------|
| `maker_checker_self_approve` | 409 |
| `proposal_not_pending` | 409 |
| `proposal_expired` | 409 |
| `proposal_not_found` | 404 |
| `apply_*` / `audit_persist_failed` | 400/409 |

**Idempotency:** second approve on already-approved by same/other checker → `409 proposal_not_pending` (harmless; no second mutation if claim succeeded first).

---

## 6. Proposed reject contract

`POST /api/admin/money-action-proposals/:id/reject`

**Body:**

```json
{ "review_note": "Duplicate / incorrect rate" }
```

`review_note` required (min length ≥ 3).

**Success:**

```json
{ "ok": true, "status": "rejected", "proposal_id": "<uuid>", "applied": false }
```

Same stale/self/expiry codes as approve. Reject must **not** call earnings writers.

**Idempotency:** duplicate reject → 409 `proposal_not_pending`.

---

## 7. Propose payload enrichment (pseudocode)

```ts
// on propose insert
payload = {
  payout_cents,
  bonus_cents,
  cleaner_id,
  adjustment_note,
  edit_mode,
  // NEW (recommended, JSON only):
  original_payout_cents,
  original_bonus_cents,
  original_total_cents,
  snapshot_at: new Date().toISOString(),
};
```

---

## 8. Atomic claim (pseudocode)

```sql
UPDATE admin_money_action_proposals
SET status = 'approved', -- or 'rejected'
    reviewed_by = $actor,
    reviewed_at = now(),
    review_note = $note -- reject only
WHERE id = $id
  AND status = 'pending'
  AND expires_at > now()
  AND proposed_by <> $actor  -- if self-approve disabled
RETURNING *;
```

If `RETURNING` empty → conflict. If approve: then `apply(payload)`. If apply fails after claim, compensating update required (document exact strategy in implementation phase 4).

---

## 9. Pagination note

Existing pending index is `(booking_id, status)`. For global queue, propose:

```sql
-- authorized migration later
CREATE INDEX admin_money_action_proposals_queue_idx
  ON admin_money_action_proposals (status, created_at DESC);
```

Not required to begin UI against small volumes; required before production scale.
