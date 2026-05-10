# Phase 15A — Measurement before enforcement

**Status:** implementation plan (measurement and observability). **Not** a rewrite, table merge, or hard DB constraint phase.  
**Prerequisite:** Phase 14 hybrid decision (`docs/payout-phase14-rail-decision-enforcement-plan.md`) and convergence audit conclusions.

---

## Strategic framing

Architecture direction is **set** (bookings as eligibility anchor; weekly batching; ledger as reconciliation layer). The remaining risk is **premature enforcement**: gates must not run ahead of **observability**.

Insight: the programme is **validating invariants**, not redesigning rails. The danger is **blocking or mutating money paths** before drift is **measured, classified, and owned**.

**Principle:** *measurement should precede enforcement* → **15A (observe) → 15B (soft gate) → 15C (hard gate)**.

---

## 1. Extend reconciliation probes (top priority)

**Existing:** P1–P8 in `supabase/queries/audit_payout_subsystem_convergence_phase11.sql`, monthly settlement probes, recurring / payment_state repair probes (e.g. Probe E), static Vitest convergence guards.

**Gap (audit):** largest unresolved risk is **ledger disbursement authority vs booking payout authority** — `claim_cleaner_earnings_for_paystack` does not join `bookings` for Phase 12-style eligibility.

### 1.1 New probe families (SQL or sibling file)

Add read-only probes that **quantify** (not block):

| Family | Intent |
|--------|--------|
| **Booking `payout_status` vs `cleaner_earnings.status`** | Map cardinality of states per `booking_id` (solo rows); surface P6/P7-style slices with extra columns (billing_type, `payout_id`, `disbursement_id`). |
| **Booking eligibility vs claimable ledger** | Rows where `cleaner_earnings.status = 'approved'` and `disbursement_id is null` but **booking would fail** `bookingPayableForWeeklyBatch` (or a documented **ledger-specific** extension of the same predicate family). Mirror predicate in SQL per Phase 12 P8 pattern. |
| **Weekly batch vs booking authority** | Rows with `payout_id` set and `cleaner_payouts` / transfer outcome vs `payout_status` / `payment_status` — operational “batch succeeded but booking payout column unresolved” visibility. |

**Goals:** measure drift, classify (historical vs active), estimate operational impact. **Do not** attach triggers or block cron.

---

## 2. Shadow eligibility validation (ledger path)

**Where:** immediately **before** `claim_cleaner_earnings_for_paystack` is invoked (e.g. inside `executeCleanerApprovedEarningsPaystack`, or a thin wrapper used only by that path).

**What:** For each booking_id in the **would-be claimed set** (or a sample + count strategy if RPC stays opaque), evaluate the **same predicate family** as `bookingPayableForWeeklyBatch` (extend with **ledger-specific** rules in code comments: solo-only, team skip, etc.).

**Behaviour:**

- **Log only** — structured log / `[metric]` with reason codes, e.g. `ledger_claim_would_fail_phase15_rules`.
- **Do not** fail the claim.
- **Do not** skip payouts.

Purpose: answer *“this disbursement **would** have been blocked under future unified rules”* — real-world violation counts and edge-case visibility for a safe **15B** gate.

---

## 3. Operational exception dashboards (admin)

Visibility tooling for humans; read-only or safe mutations only (e.g. filters, exports), not financial writes in 15A.

| Dashboard | Content |
|-----------|---------|
| **A. Ledger vs booking** | Slices for: booking says paid / ledger unpaid; ledger paid / booking not paid (extends P6/P7 with context columns). |
| **B. Eligibility violations** | Earnings selected or approved for disbursement while shadow predicate fails (fed by §2 logs or batch SQL). |
| **C. Weekly anomalies** | Transfer or `cleaner_payouts` success vs booking `payout_status` / `payment_status` mismatch; `payment_status` partial_failed / failed on batch. |

---

## 4. Inventory remaining direct `bookings` mutations

Audit identified **generic admin PATCH**, **dispatch internals**, **some crons/scripts** still bypassing `bookingOperations`.

**15A work:**

1. Repo-wide inventory of `from('bookings').update` / `insert` (and raw SQL if any).
2. Classify each: **safe** (operational only), **legacy**, **dangerous** (financial or payout-adjacent).
3. Prioritise **dangerous** for migration to `bookingOperations` or narrow RPCs — **plan and execute in 15A/15B** as operational convergence, not payout mechanics rewrites.

---

## 5. Refund observability only (not automation)

**Do not** (15A): mutate `payout_frozen_cents`, change eligibility, auto-reverse payouts, or add fail-closed refund enforcement.

**Do** (15A):

- **Probes:** rows with `refunded_at` / `refund_status` set vs payment still success (if columns exist).
- **Logging:** if Paystack sends ignored events, log at `info`/`warn` with event type + reference (no schema mutation).
- **Webhook observability:** document or lightweight handler that **records** refund/chargeback events to `system_logs` or a dedicated audit table **without** applying business reversals.

Reason: refunds are the fastest way to **corrupt** payout systems if enforced before measurement.

---

## 6. Stabilise terminology (UI / admin / runbooks)

| Meaning | Authoritative source (conceptual) |
|---------|-----------------------------------|
| **Customer paid** | `bookings.payment_status` (+ invoice / Paystack charge context) |
| **Cleaner payout eligible (job)** | `bookings.payout_status` + `payout_frozen_cents` (monthly path) |
| **Batched for weekly Paystack** | `bookings.payout_id` → `cleaner_payouts` |
| **Ledger disbursement state** | `cleaner_earnings.status` + `disbursement_id` / disbursement tables |
| **Transfer settled (money moved)** | Paystack transfer + `payout_transfers` / `earnings_disbursement_transfers` |

**15A:** document in admin copy and internal runbooks; optional small UI labels where low-risk. Full UI refactor is not required for 15A.

---

## 7. Explicit “DO NOT DO YET” (15A scope boundary)

- Merge payout tables or rails.
- Hard-enforce ledger = booking equality in DB.
- Rewrite payout or transfer handlers.
- Collapse payout state vocabulary in code/DB.
- Auto-reverse payouts on refund webhooks.
- Add fail-closed DB constraints on `cleaner_earnings` / `bookings` for hybrid invariants.

→ Reserved for **15C+** after probe burn-in and sign-off.

---

## Recommended sequencing (calendar-style)

| Week | Focus |
|------|--------|
| **Week 1** | Shadow eligibility checks (log-only); expand SQL probes; anomaly / metric logging. |
| **Week 2** | Admin mismatch dashboards (`/admin/payouts/phase15a-diagnostics`, API `phase15a-anomalies`). |
| **Week 3** | Advisory anomaly **classification** + burn-in readiness for Phase 15B prep (read-only). |

Adjust for team capacity; order within a week can parallelise where safe.

---

## 8. Week 3 — Advisory classification (not enforcement)

**Goal:** triage anomalies for humans and Phase **15B** *soft-gate* design without blocking or mutating money paths.

### 8.1 Principles

- Classification is **rule-based**, **read-only**, and **advisory** only.
- It **does not** block payouts, skip claims, change `payout_status`, mutate `cleaner_earnings`, or alter Paystack behaviour.
- Phase **15B** may later *defer* or *soft-fail* using the **same** underlying predicates (`bookingPayableForWeeklyBatch`, SQL P8/P10/P11 family); Week 3 only **labels** rows for review.

### 8.2 Classification labels

| Classification | Meaning (high level) |
|----------------|---------------------|
| `active_blocker_candidate` | Likely to matter under a future unified authority gate (e.g. ledger ahead of booking payout; claim-shaped ledger failing weekly predicate; recent batched+claim drift). |
| `legacy_drift_candidate` | Old completed jobs (`completed_at` older than ~90 days) with batch/authority mismatch — often historical or migration drift. |
| `refund_related_candidate` | Booking shows refund / reversal signals (`refunded_at` / `refund_status` per `bookingPaymentRecomputeBlockedByRefund`). |
| `terminology_mismatch_candidate` | Weekly rail settled but job `payout_status` still `eligible`, or booking marked `paid` while ledger off-rail (vocabulary / rail lag). |
| `missing_relation_candidate` | Missing or invalid `booking_id` / `cleaner_id` on the anomaly row. |
| `needs_manual_review` | Ambiguous or mixed signals — human triage before any gate. |

Implementation: `apps/web/lib/payout/phase15aAnomalyClassification.ts` (applied in `phase15aAnomaliesReadModel.ts`).

### 8.3 API / UI

- **GET** `/api/admin/payouts/phase15a-anomalies` — per row: `classification`, `classification_reason`; aggregates: `counts_by_classification`, `counts_by_category_and_classification`; `burn_in_readiness`; `phase15b_pre_gate_readiness`; `classification_advisory_note`. Optional query `classification=<slug>` filters the **response slice** (burn-in still uses the **full** scan).
- **UI:** `/admin/payouts/phase15a-diagnostics` — badges, counts by classification, burn-in summary, copy: *Classification is advisory. Phase 15A still does not block payouts.*

#### 8.3.1 Shared scan window (`PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN`)

Governance and screenshots should treat **one** observation window for Phase 15A anomaly scans. The codebase defines a single constant:

- **`PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN = 5000`** — in `apps/web/lib/payout/phase15aAnomaliesShared.ts` (shared by the API route, read model clamp, and admin UI).

**Behaviour (documentation of current alignment):**

| Aspect | Detail |
|--------|--------|
| **Admin diagnostics** | `/admin/payouts/phase15a-diagnostics` sends **`max_scan=5000`** on every load (same constant), so the dashboard matches the default burn-in window unless an operator changes the request manually (e.g. devtools). |
| **API default** | **`GET /api/admin/payouts/phase15a-anomalies`** uses **5000** when **`max_scan` is omitted**, so scripted burn-in and bare API calls agree with the diagnostics page. |
| **Smaller scans** | Callers may still pass a **smaller** `max_scan` for faster or narrower checks; the **governance burn-in contract** for sign-off and parity with ops snapshots remains **5000**. |
| **Upper clamp** | Values **above** the maximum are **capped at 5000** server-side (constant and read model agree). |

**Why it matters:** aligning the dashboard query, API default, and burn-in scripts avoids a subtle mismatch where the UI could imply “clean at 2000 rows” while burn-in measured **5000** — or the reverse. One default window reduces **dashboard vs API vs burn-in** interpretation drift during audits, support, and Phase 15B readiness discussions.

### 8.4 Guiding Phase 15B

- Start soft gates from **`active_blocker_candidate`** and **`refund_related_candidate`**, correlated with Week 1 shadow logs and SQL probes.
- Use **`legacy_drift_candidate`** / **`terminology_mismatch_candidate`** for runbooks and §6 terminology alignment.
- **`missing_relation_candidate`** → data investigation, not payout code changes in 15A.

### 8.5 Explicit non-enforcement

Do not wire classification or burn-in hints to claim RPCs, transfer handlers, or mark-paid until **15B/15C** sign-off. `phase15b_pre_gate_readiness.status` is a **hint** only.

---

## References

- `docs/payout-phase14-rail-decision-enforcement-plan.md`
- `docs/payout-phase13-cleaner-earnings-reconciliation-audit.md`
- `apps/web/lib/payout/bookingPayableForWeeklyBatch.ts`
- `apps/web/lib/payout/phase15aAnomalyClassification.ts`
- `apps/web/lib/payout/phase15aAnomaliesShared.ts` (`PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN` — diagnostics / API / burn-in scan window)
- `apps/web/lib/payout/phase15aAnomaliesReadModel.ts`
- `apps/web/lib/payout/executeCleanerApprovedEarningsPaystack.ts`
- `supabase/migrations/20260842_cleaner_earnings_paystack_transfer.sql` (`claim_cleaner_earnings_for_paystack`)
- `supabase/queries/audit_payout_subsystem_convergence_phase11.sql`

**Next after 15A:** Phase **15B** — soft gates (defer/skip with error codes) using the same predicates, then **15C** — hard enforcement. **Planning (no implementation yet):** `docs/payout-phase15b-soft-governance-plan.md` — flags, dry-run, warnings, override, telemetry, rollback, rollout order, and explicit non-blocking rules.
