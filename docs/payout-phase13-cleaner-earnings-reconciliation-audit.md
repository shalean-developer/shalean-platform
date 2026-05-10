# Phase 13 — Cleaner earnings / booking payout reconciliation audit

**Status:** read-only decision support. **No runtime or transfer changes** in this phase.  
**Prerequisites:** Phase 11 map, Phase 11B authority doc, Phase 12 `bookingPayableForWeeklyBatch`.

---

## 1. Question under review

Should **`cleaner_earnings`** remain a **separate payout rail** (its own claim, disbursement, Paystack transfer, and `paid` semantics), or should it become a **projection / reconciliation layer** on top of **booking payout truth** (`bookings.payout_*`, `cleaner_payouts`, admin mark-paid)?

This document records **observed behaviour** and **divergence probes** so that decision is evidence-based.

---

## 2. Three parallel surfaces (today)

| Surface | Primary role | Paystack attachment | Typical `paid` semantics |
|---------|----------------|----------------------|-------------------------|
| **`bookings`** (`payout_status`, `payout_frozen_cents`, `payout_id`, `payout_run_id`, …) | Per-job **eligibility** and admin “invoice paid” lifecycle; weekly **batch link** via `payout_id` | Customer **charge** webhooks settle prepay / monthly invoice; **not** cleaner transfer | `payout_status = paid` via **`admin_mark_payout_paid`** RPC (booking-only) |
| **`cleaner_payouts`** + **`payout_transfers`** | **Weekly aggregated** batch per cleaner / period | **Transfer** webhooks (`/api/webhooks/paystack`) keyed by `transfer_code` → `payout_transfers` | `cleaner_payouts.status = paid` when transfers succeed (`paystackTransferStatus.ts`) |
| **`cleaner_earnings`** + **`cleaner_earnings_disbursements`** + **`earnings_disbursement_transfers`** | **Solo** ledger row per booking after line finalize; batched Paystack by cleaner | Same transfer webhook path, different tables (`earnings_disbursement_transfers`) | `cleaner_earnings.status = paid` when disbursement transfer succeeds |

There is **no single database constraint** forcing these three to advance in one transaction. Reconciliation is **operational** (cron, admin, probes).

---

## 3. `bookings.payout_status` (observed)

- **Values** (from migrations / checks): `pending`, `eligible`, `paid` (monthly settlement and admin path).
- **Writers (non-exhaustive):**
  - Monthly invoice settlement / manual mark-paid flows set **`eligible`** + **`payout_frozen_cents`** (see `applyMonthlyInvoicePayment`, `markMonthlyInvoicePaidManual`).
  - **`admin_mark_payout_paid(p_cleaner_ids uuid[])`** (Postgres RPC) sets **`paid`**, `payout_paid_at`, shared **`payout_run_id`** for rows already **`eligible`** (`supabase/migrations/20260730_admin_mark_payout_paid_team_members.sql`).
- **Admin HTTP path:** `POST /api/admin/payouts/mark-paid` calls the RPC, then **read-back** bookings by `payout_run_id` for logging and totals — it does **not** update `cleaner_earnings` or `cleaner_payouts` in that route (`apps/web/app/api/admin/payouts/mark-paid/route.ts`).

So **booking `paid`** is authoritative for **“admin / invoice rail marked this job paid”**, not for **“Paystack sent this job’s cleaner money”** on the ledger rail.

---

## 4. `cleaner_payouts` (weekly batch rail)

- **Created** by `generateWeeklyPayouts` (Phase 12 now gates rows with `bookingPayableForWeeklyBatch`).
- **Bookings** link with `payout_id`; amounts are **aggregated** from stored booking cents (not recomputed in batch).
- **Paystack:** `payout_transfers` rows; `transfer.success` / `transfer.failed` handled in `applyPayoutTransferSuccess` / `applyPayoutTransferFailed` (`apps/web/lib/payout/paystackTransferStatus.ts`).
- **On `transfer.failed`:** updates **`payout_transfers`** and **`cleaner_payouts.payment_status`** (`failed` or `partial_failed`); **does not** clear `bookings.payout_id` or revert `bookings.payout_status`.

---

## 5. `cleaner_earnings` (ledger rail)

- **Insert:** `ensureCleanerEarningsLedgerRow` — **solo**, **completed**, line earnings **finalized**, idempotent on `booking_id` (`apps/web/lib/payout/ensureCleanerEarningsLedger.ts`). Initial status **`pending`**.
- **Promotion / amounts:** not fully enumerated here; admin and lifecycle paths can move rows toward **`approved`** (disbursement pickup).
- **Disbursement:** `executeCleanerApprovedEarningsPaystack` calls RPC **`claim_cleaner_earnings_for_paystack`**, sends Paystack `/transfer`, inserts **`earnings_disbursement_transfers`** (`processing`). On **pre-webhook failure** (Paystack error, bad state, insert failure), **`revertClaimedDisbursement`** sets earnings back to **`approved`** and `disbursement_id = null`, disbursement **`failed`** (`apps/web/lib/payout/executeCleanerApprovedEarningsPaystack.ts`).
- **Webhook success:** marks **`cleaner_earnings`** `paid` + disbursement `paid` (`applyEarningsDisbursementTransferSuccess` in `paystackTransferStatus.ts`).
- **Webhook `transfer.failed`:** sets **`cleaner_earnings`** from **`processing`** → **`approved`**, `disbursement_id = null`; disbursement **`failed`** (`applyEarningsDisbursementTransferFailed`).

**Read-model comment in code:** `cleanerEarningsReadModel.ts` states the ledger is **source of truth for settled / paid history**, while booking columns are the **per-job snapshot** for fast UI — explicitly allowing **reconciliation** to compare them.

---

## 6. Paystack transfer routing (single webhook, two families)

`POST /api/webhooks/paystack` resolves `transfer_code` against:

1. **`payout_transfers`** → weekly **`cleaner_payouts`** rail.  
2. Else **`earnings_disbursement_transfers`** → **`cleaner_earnings`** rail.

Cron **`reconcile-paystack-transfers`** reuses `applyTransferSuccess` / `applyTransferFailed` for stuck **`processing`** rows (`apps/web/app/api/cron/reconcile-paystack-transfers/route.ts`).

---

## 7. Divergence dimensions (by design gap, not only bugs)

### 7.1 Booking `paid` vs ledger not `paid`

- **Cause:** Admin mark-paid **only** updates `bookings`. Ledger rows are **not** auto-flipped to `paid` in that route.
- **SQL probe:** `supabase/queries/audit_payout_subsystem_convergence_phase11.sql` — **P6** (`booking_paid_ledger_not_paid`).

### 7.2 Ledger `paid` vs booking not `paid`

- **Cause:** Earnings disbursement Paystack success marks **`cleaner_earnings`** without requiring **`bookings.payout_status = paid`** (separate rail).
- **SQL probe:** same file — **P7** (`ledger_paid_booking_not_paid`).

### 7.3 Weekly `cleaner_payouts` paid vs booking `payout_status`

- Weekly success marks **`cleaner_payouts`**; booking **`payout_status`** may still be **`pending`/`eligible`** depending on billing mode (Phase 11B authority matrix). Not necessarily an error — **different vocabulary**.

### 7.4 Shadow reconciliation (app-level)

- **`earningsLedgerShadowTotals.ts`** maps **card** `payout_status` (+ frozen batch) to **expected** ledger status (`approved` ↔ eligible in frozen batch, etc.) and computes drift / “flip ready” for optional ledger-first totals.
- Cleaner **reconcile** API (referenced from metrics docs) compares card slice vs ledger for intersection bookings.

---

## 8. Decision framing (no recommendation enforced here)

### Option A — **Separate rail forever** (status quo architecture)

- **Meaning:** Keep **`cleaner_earnings`** as the **Paystack disbursement** source for solo ledger payouts; keep **bookings + weekly batches** as the other customer→cleaner settlement paths; accept **multi-writer** `paid` semantics with probes and shadow checks.
- **Fits when:** Product wants **independent** “request ledger payout” / batch automation without coupling every booking `payout_status` flip to Paystack.

### Option B — **Projection / reconciliation layer**

- **Meaning:** Treat **`bookings` (+ `cleaner_payouts`)** as **canonical payout eligibility and settlement** for “job paid”; **`cleaner_earnings`** becomes **derived** (insert/update from booking events, or read-only view materialized from bookings) so **`paid`** on the ledger **cannot** disagree with booking truth without an explicit exception queue.
- **Fits when:** Ops and finance need **one** answer to “was this job’s cleaner obligation extinguished?” and double Paystack rails are unacceptable.

### Option C — **Hybrid (common in migrations)**

- Keep two rails short-term but add **hard invariants** (DB checks or blocking RPCs) for subsets that must align (e.g. “if `cleaner_earnings.status = paid` then `bookings.payout_status` in (`paid`, …)” **or** explicit `exception_approved_by`).

---

## 9. SQL / API probes (read-only checklist)

| Probe / tool | What it catches |
|--------------|-----------------|
| **P6** / **P7** in `audit_payout_subsystem_convergence_phase11.sql` | Booking vs ledger `paid` mismatch (both directions) |
| `GET` cleaner earnings **reconcile** (see `cleaner.earnings_invariant_mismatch` in metrics comments) | Intersection amount / missing ledger |
| **Shadow totals** (`earningsLedgerShadowTotals`) | Bucket drift before flipping ledger-first UI |

---

## 10. Explicit non-goals (Phase 13)

- No change to **`applyTransferSuccess` / `applyTransferFailed`** behaviour.
- No merge of **`cleaner_payouts`** and **`cleaner_earnings`** without a signed migration plan.
- No new **single writer** for `paid` until the Option A/B/C choice is recorded with owners.

---

## 11. Sign-off block (for humans)

| Decision | Notes |
|----------|--------|
| Canonical “job paid to cleaner obligation” definition | Bookings only / ledger only / union with rules |
| May `cleaner_earnings.paid` exist when `bookings.payout_status ≠ paid`? | Currently **yes** |
| Should admin mark-paid enqueue ledger updates? | Currently **no** |

**Phase 14** records the chosen policy and Phase 15 enforcement outline: `docs/payout-phase14-rail-decision-enforcement-plan.md`.
