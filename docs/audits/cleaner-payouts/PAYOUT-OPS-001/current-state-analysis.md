# PAYOUT-OPS-001 — Current-state analysis

| Field | Value |
|-------|-------|
| **Work package** | PAYOUT-OPS-001 |
| **Analysis date** | 2026-07-21 |
| **Authority** | Planning / design only — no implementation |
| **Source of Phase A evidence** | `../PAYOUT-E2E-001/evidence/phase-a-staging-verification-2026-07-21.md` |

---

## 1. Current architecture

### 1.1 Earnings-edit UI (Office)

| Surface | Path | Role |
|---------|------|------|
| Payouts hub | `apps/web/app/(ui-redesign)/office/payouts/page.tsx` | Hosts cleaner edit via `?editCleaner=&from=&to=` |
| Primary visit-earnings editor | `apps/web/components/admin/office/OfficeCleanerEarningsEditPanel.tsx` | Loads visits; PATCH adjust; toast on `requires_approval` |
| Batch payout detail editor | `apps/web/components/admin/office/OfficePayoutDetailPanel.tsx` | Also PATCHes adjust; **does not** branch on `requires_approval` |
| Editable visit DTO | `apps/web/lib/admin/payouts/officeCleanerEditableVisits.ts` | `OfficeCleanerEditableVisitRow` |
| Cleaner visits API | `GET /api/admin/payouts/cleaner-visits` | Canonical amounts for Office panel |

**Nav pattern:** Finance → Payouts (`apps/web/src/features/office/OfficeNav.tsx`). No Approvals nav item today.

### 1.2 Proposal creation + approval (same route)

| Item | Detail |
|------|--------|
| Route | `PATCH /api/admin/bookings/[id]/adjust-payout-earnings` |
| File | `apps/web/app/api/admin/bookings/[id]/adjust-payout-earnings/route.ts` |
| Auth | `requireAdminApi` → Bearer JWT + `evaluateAdminAllowlist` |
| Gate | `withEarningsAdjustMakerChecker` → `withMoneyActionMakerChecker` |
| Lib | `apps/web/lib/payout/earningsAdjustMakerChecker.ts` |
| Apply facade | `adjustVisitPayoutEarnings` → solo `adjustBookingPayoutEarnings` or per-cleaner `adjustBookingTeamMemberPayoutEarnings` |
| Classifier | `classifyVisitPayoutEdit` |

**Propose (no `proposal_id`):** inserts `admin_money_action_proposals` with `status: pending`, returns `{ requires_approval: true, applied: false, proposal_id }`.

**Approve (`proposal_id` present):** loads proposal, checks booking/action/status/expiry/self-approve, then runs `apply()`, then sets `status: approved`.

### 1.3 Rejection

| Item | Status |
|------|--------|
| DB status value | `rejected` allowed by CHECK constraint |
| Column | `review_note` exists for rejection reason |
| API / lib path | **Missing** — `withMoneyActionMakerChecker` never sets `rejected` |
| Office UI | **Missing** |

### 1.4 Database

**Table:** `public.admin_money_action_proposals`

| Column | Notes |
|--------|-------|
| `id` | uuid PK (`gen_random_uuid`) — **proposal_id** |
| `action_type` | `adjust_payout_earnings` \| `adjust_team_payout_earnings` \| `reprice_booking_details` |
| `booking_id` | FK → `bookings` |
| `payload` | jsonb (proposed amounts / note / cleaner_id / edit_mode) |
| `proposed_by`, `proposed_by_email` | Maker identity |
| `status` | `pending` \| `approved` \| `rejected` \| `expired` |
| `reviewed_by`, `reviewed_at`, `review_note` | Checker fields |
| `created_at` | Proposal timestamp |
| `expires_at` | Default **now() + 24 hours** |

**Index:** `admin_money_action_proposals_pending_idx` on `(booking_id, status) WHERE status = 'pending'` — good for booking-scoped lookups; **insufficient alone** for a global pending queue ordered by `created_at`.

**RLS:** enabled; admin APIs use service-role client (`getSupabaseAdmin`). No dedicated list RLS policies required for the Office server path if service role continues.

### 1.5 Lifecycle statuses (today)

| Status | How reached |
|--------|-------------|
| `pending` | Insert on propose |
| `approved` | After successful `apply()` on approve path |
| `expired` | Lazy mark when approve attempted past `expires_at` |
| `rejected` | Schema-ready; **no writer** |
| `cancelled` / `applied` | **Not** in CHECK — “applied” is implied by `approved` + earnings mutation |

### 1.6 Authorization & maker–checker

| Control | Implementation |
|---------|----------------|
| Admin auth | `requireAdminApi` (`apps/web/lib/auth/requireAdminApi.ts`) |
| Role model | Email allowlist (`evaluateAdminAllowlist`) — not finance-stage roles like expenses |
| Flag | `PAYOUT_MAKER_CHECKER=true` enables propose/approve gate |
| Self-approve | Blocked unless `PAYOUT_ALLOW_SELF_APPROVE=true` (`maker_checker_self_approve` → HTTP 409) |
| Feature-flag bypass from client | Not possible; env read server-side only |

### 1.7 Audit logging (on apply only)

| Mechanism | When |
|-----------|------|
| `requireVisitEarningsAdjustAudit` → `payout_audit_events` (`visit_earnings_adjusted`) | Fail-closed on successful apply |
| `logAdminEarningsAction` → `admin_earnings_actions` (`manual_adjust`) | Best-effort on apply |
| `logSystemEvent` `BOOKING_PAYOUT_EARNINGS_ADJUSTED` | Best-effort on apply |
| Propose-side audit | **Not written** today (row in `admin_money_action_proposals` is the durable propose record) |

### 1.8 Equivalent refund workflow

| Aspect | Refunds | Earnings adjust |
|--------|---------|-----------------|
| Storage | `booking_snapshot` refund proposal | `admin_money_action_proposals` |
| Gate | `evaluateRefundMakerChecker` | `withMoneyActionMakerChecker` |
| Amount immutability | **Enforced** (`proposal_mismatch` if amount differs) | **Not enforced** — approve uses request body, not stored payload |
| Office UX | `AdminBookingRefundDialog` surfaces `proposal_id` for second admin to paste | Toast only; `proposal_id` discarded in UI |

Refund is a **manual proposal-id paste** pattern, not a queue — still better operationally than earnings adjust today.

### 1.9 Expense approval (UX analogue, different domain)

`apps/web/app/(ui-redesign)/office/expenses/page.tsx` + `expenseApprovalService.ts`: list + confirm Approve + prompt Reject. Closest Office pattern for pending-approvals UX (not money-action proposals).

---

## 2. End-to-end workflow (as implemented)

```text
Admin A edits visit in OfficeCleanerEarningsEditPanel
  → PATCH …/adjust-payout-earnings { payout_cents, bonus_cents, cleaner_id }
  → withMoneyActionMakerChecker (no proposal_id)
  → INSERT admin_money_action_proposals (pending, payload, expires_at+24h)
  → Response { requires_approval:true, proposal_id }
  → UI counts pendingApproval; toast; reload visits
  → Canonical earnings unchanged (PASS — Phase A)

Admin B (today)
  → No Office list / Approve button
  → Must know proposal_id + booking_id + amount and call PATCH with proposal_id
  → Gate: pending, not expired, not self, booking/action match
  → apply() mutates booking / TJ / roster rails + audit
  → UPDATE proposal status=approved
```

### What works

- Propose without mutating stored earnings.
- Refresh restores canonical amount.
- Second-admin API gate + self-approve block.
- Proposal row durable with `proposal_id`.
- Apply path updates earnings + fail-closed visit audit.

### What is inaccessible through Office

- Pending proposals list.
- `proposal_id` display / copy.
- Approve / Reject actions.
- Diff (original vs proposed), reason, proposer identity in a queue.

### Where `proposal_id` is generated / lost

| Step | Location |
|------|----------|
| Generated | DB default `gen_random_uuid()` on insert; returned as `gate.proposalId` |
| Returned to client | JSON `proposal_id` on propose response |
| Lost | `OfficeCleanerEarningsEditPanel` increments counter only — **never stores or displays** `proposal_id` |
| Never surfaced | `OfficePayoutDetailPanel` treats any `res.ok` as saved |

### How approval changes canonical earnings

`adjustVisitPayoutEarnings` → writer updates hybrid booking columns and/or `team_job_member_payouts` / `booking_roster_member_payouts`, syncs open batches, read-after-write assert, then audit.

### Rejection / expiry / duplicates / concurrency

| Topic | Current behaviour |
|-------|-------------------|
| Rejection | Not implemented |
| Expiry | 24h default; marked `expired` on late approve attempt |
| Duplicate pending proposals | **Allowed** — no unique constraint on (booking, cleaner, pending) |
| Concurrent approve | Check-then-act without conditional `UPDATE … WHERE status='pending' RETURNING`; **race risk** of double apply |
| Approve payload source | Request body amounts — **not** locked to proposal.payload (control gap vs refund) |

---

## 3. Inventory of inspected artefacts

### Files / functions

- `earningsAdjustMakerChecker.ts` — `withMoneyActionMakerChecker`, `withEarningsAdjustMakerChecker`, `MoneyActionType`
- `adjust-payout-earnings/route.ts` — `PATCH`
- `adjustVisitPayoutEarnings.ts`, `adjustBookingPayoutEarnings.ts`, `adjustBookingTeamMemberPayoutEarnings.ts`
- `requireVisitEarningsAdjustAudit.ts`, `logAdminEarningsAction.ts`
- `requireAdminApi.ts`
- `OfficeCleanerEarningsEditPanel.tsx`, `OfficePayoutDetailPanel.tsx`, `office/payouts/page.tsx`
- `AdminBookingRefundDialog.tsx`, `refundMakerChecker.ts`
- `expenseApprovalService.ts`, `office/expenses/page.tsx`
- `edit-details/route.ts` (reprice also uses money-action proposals)
- Schema: `supabase/migrations-legacy/20261074_phase3_catalog_audit_maker_checker.sql`, baseline table definition

### Routes

- `PATCH /api/admin/bookings/[id]/adjust-payout-earnings`
- `GET /api/admin/payouts/cleaner-visits`
- `POST /api/admin/bookings/[id]/refund` (analogue)
- **No** `GET /api/admin/.../money-action-proposals` (or equivalent)

### Tables

- `admin_money_action_proposals` (proposals)
- `bookings`, `team_job_member_payouts`, `booking_roster_member_payouts`, `cleaner_payouts` (apply targets)
- `payout_audit_events`, `admin_earnings_actions` (audit on apply)

---

## 4. Operational gap summary

Phase A financial control is intact. The operational gap is exclusively Office workflow completeness: discoverability, second-admin actions, and reject path — plus control-hardening on approve (immutable payload + atomic claim) that should be included when implementing the Office capability.
