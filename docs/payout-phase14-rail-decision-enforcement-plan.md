# Phase 14 — Payout rail decision + enforcement plan

**Status:** decision record and implementation **plan** only. **No code** in Phase 14.  
**Inputs:** Phase 11 map, Phase 11B authority, Phase 12 `bookingPayableForWeeklyBatch`, Phase 13 reconciliation audit.

---

## 1. Strategic question (resolved for planning)

Should **`cleaner_earnings`** stay an **independent** payout truth, become a **pure projection** of bookings, or adopt a **hybrid** model with explicit invariants and a controlled reconciliation role?

**Recorded direction (recommended and adopted for Phase 15 planning):** **Hybrid invariants.**

Phase 14 is the **architectural decision point**: the programme moves from *finding inconsistencies* to *defining the financial operating model* under that hybrid.

---

## 2. Final layer model (financial operating structure)

| Layer | Responsibility |
|-------|------------------|
| **`bookings`** | **Canonical payout eligibility truth** — customer settlement signals, `payout_status`, `payout_frozen_cents`, `payout_id`, Phase 12 weekly-batch predicates, etc. |
| **`cleaner_payouts`** (+ `payout_transfers`) | **Batching and transfer grouping** for the weekly Paystack rail |
| **`cleaner_earnings`** (+ disbursements + `earnings_disbursement_transfers`) | **Ledger, reconciliation, and reporting** — history and disputes per `booking_id`; **subordinate** to booking eligibility (not a second independent “payable” authority) |
| **Transfer rails** (Paystack + child tables) | **Money movement only** — execution and audit trace; eligibility is **upstream** on `bookings` |

**Strategic outcome:** **`bookings` is the single upstream financial authority** for eligibility. Every weekly batch, ledger row, and transfer is interpreted **downstream** of that anchor, which reduces long-term double-authority and drift risk.

**Plain language:** Two Paystack **families** (weekly vs ledger disbursement) remain for traceability and recovery; **who may be paid, for which job, under which policy** is decided on **`bookings`**, then enforced and reflected on other layers.

---

## 3. Why hybrid (vs the two extremes)

### Pure projection (`cleaner_earnings` only as a derived view)

**Avoid for this codebase (near term):** collapsing the ledger into a view-only model makes **reconciliation** against Paystack harder, weakens **immutable-style audit** for adjustments and disputes, and complicates **transfer recovery** (webhooks and `processing` / revert paths today assume concrete rows).

### Fully separate rails forever

**Avoid:** **`bookings`** and **`cleaner_earnings`** each implying payout truth produces **permanent drift** (see Phase 13 P6/P7), **double authority**, reconciliation load, and much harder **refund / reversal** semantics.

### Hybrid invariants (chosen)

**Prefer:** One **eligibility** authority (`bookings`), one **weekly batching** rail, one **ledger / reconciliation** layer, with **explicit invariants** and exceptions — preserving **audit history**, **transfer traceability**, **rollback / recovery**, and **reporting flexibility** without a big-bang rewrite.

**Implementation note:** Hybrid still uses **existing tables and transfer handlers** in early Phase 15 sub-phases; work is **boundary enforcement** and **reconciliation automation**, not a new payout engine.

---

## 4. Invariant catalogue (targets for Phase 15 enforcement)

These are **policy statements**; Phase 15 chooses DB vs RPC vs app enforcement per row.

**I1 — Eligibility anchor**  
No automation may treat a booking as **ledger-payable** unless **`bookings`** satisfy the agreed customer-settled + job rules (Phase 12 weekly predicate is already one consumer; ledger claim paths must use the **same family** of predicates where applicable).

**I2 — Ledger is subordinate to job payout state (default)**  
For a given `booking_id`, if **`bookings.payout_status`** is in a terminal **admin / invoice** state that **denies** further cleaner disbursement (e.g. not eligible for the chosen policy), then **`cleaner_earnings`** must not remain in a state that implies **successful outbound Paystack** for that job without an **exception** (see I5).

**I3 — No silent double rail on the same obligation (scoped)**  
Define a **narrow** rule set for when both **`payout_id`** (weekly) and **ledger `paid`** may exist for the same booking — default: **disallowed** unless documented exception (e.g. legacy rows, migration window).

**I4 — Amount alignment**  
`cleaner_earnings.amount_cents` must **reconcile** to the booking-derived basis used at insert/approval time (within existing dispute/adjustment tables); Phase 15 references **`cleaner_earnings_adjustments`** instead of mutating base rows.

**I5 — Exception queue**  
Any row that **must** violate I2–I4 temporarily (legacy debt, manual correction) carries an **explicit flag or ticket**; enforcement is **fail closed** for new rows, **warn / batch** for grandfathered rows.

**I6 — Transfer behaviour unchanged in Phase 15 unless explicitly listed**  
`applyTransferSuccess` / `applyTransferFailed` and `executeCleanerApprovedEarningsPaystack` revert paths stay **mechanically** the same; Phase 15 adds **gates before claim** and **reconciliation writes after** booking state changes, not a rewrite of Paystack handlers unless a separate sub-phase is opened.

---

## 5. Phase 15 — staged enforcement (do not ship “all hard rules” in one step)

Phase 15 is **enforcing financial truth boundaries** inside the existing architecture — **not** a payout rewrite.

### 5.1 Phase 15A — Probe-first enforcement (observe, no hard blocking)

- **E4 — SQL probes + CI:** extend `audit_payout_subsystem_convergence_phase11.sql` (or a sibling file) for **I2–I4**; wire **CI or scheduled** runs.
- **Shadow / metrics:** strengthen warnings from `earningsLedgerShadowTotals`, reconcile endpoints, and `[metric]` logs — **anomaly queues** for humans.
- **Goal:** measure drift, build confidence; **no** fail-closed blocking on production paths yet.

### 5.2 Phase 15B — Soft gating

**Planning doc (flags, dry-run, telemetry, rollback, rollout — implementation later):** `docs/payout-phase15b-soft-governance-plan.md`.

- **E1 — Predicate reuse** and **E2 — Claim / approve gates:** begin **rejecting or deferring** ledger claims that violate I1–I3 with **clear error codes** and **admin visibility** (dashboards / runbooks).
- Prefer **new** bookings and **new** disbursement attempts first; grandfather **I5** explicitly.
- **E5 — Shadow / flip policy:** tighten when UI may treat ledger as primary (`isEarningsLedgerFlipReady` / `USE_LEDGER_TOTALS` policy) only when invariants are consistently green for the slice.

### 5.3 Phase 15C — Hard invariant enforcement

Only after:

- drift volume stabilises,
- probes trend **green** (or exceptions are bucketed and owned),
- ops sign-off,

introduce **fail-closed** rules (DB constraints, RPC hard checks, or blocking triggers) for the scoped ruleset — still **without** changing `applyTransferSuccess` / `applyTransferFailed` mechanics unless opened as a separate, explicit sub-phase (**I6**).

### 5.4 Workstream map (carried from planning)

| ID | Workstream | Typical first sub-phase |
|----|------------|-------------------------|
| **E1** | Predicate reuse for **ledger** paths | 15B |
| **E2** | Claim / approve gates | 15B |
| **E3** | Admin mark-paid **bridge** to ledger (sync write vs async job) | 15B or early 15C (after probe sign-off) |
| **E4** | SQL probes + CI | **15A** |
| **E5** | Shadow / flip policy | 15A signals → 15B policy |

**Default sequencing:** **15A → 15B → 15C** (probe-first, then soft gates, then hard enforcement).

---

## 5.5 Programme position (post Phase 14)

Core **financial structure** (eligibility anchor, weekly batching, ledger role, transfer separation) is **set**. Remaining programme work skews toward **enforcement**, **reconciliation automation**, **refund modelling**, **operational tooling**, and **anomaly recovery** — not re-deriving the rail model.

Architecture docs here stay **factual**, **operational**, and **invariant-focused** (no progress percentages or marketing tracking links).

**Organisation context (neutral):** [Shalean Cleaning Services](https://www.shalean.co.za) — recurring-services operator; the payout rail model in this repository is sized for that kind of business.

### 5.6 Next engineering move — Phase 15A only

**Principle:** *measurement should precede enforcement.*

The next **implementation** phase is **Phase 15A (probe-first)** — detailed plan: `docs/payout-phase15a-measurement-before-enforcement.md` (new probes, shadow ledger validation, dashboards, direct-mutation inventory, refund observability only, terminology). **Not** payout rewrites, ledger merges, transfer refactors, or refund **enforcement** until drift is measured and sign-off in §7 is in place.

Staging **15A → 15B → 15C** reduces risk of accidental payout freezes, noisy false positives, mass reconciliation surprises, and cleaner/admin operational shocks.

---

## 6. Risks and explicit deferrals

- **Backfill:** Rows matching P6/P7 today need a **one-time classification** (fix booking, fix ledger, or exception) before **fail-closed** enforcement in production.
- **Team jobs:** Ledger insert today skips **team** bookings (`ensureCleanerEarningsLedgerRow`); hybrid rules must **respect** that scope so team weekly logic is not accidentally blocked.
- **Weekly vs ledger:** Hybrid **does not** merge `cleaner_payouts` into `cleaner_earnings`; it **coordinates** them. Merging remains out of scope unless a future phase reopens architecture.

---

## 7. Sign-off (required before Phase 15 coding)

| Item | Owner | Decision / date |
|------|--------|-------------------|
| Adopt **hybrid invariants** as strategic direction | | |
| Default rule for **I3** (double rail) | | |
| **E3** behaviour on admin mark-paid (sync write vs async job) | | |
| Grandfather policy for **I5** | | |

---

## 8. Reference documents

- `docs/payout-authority-lifecycle-phase11b.md`
- `docs/payout-phase13-cleaner-earnings-reconciliation-audit.md`
- `supabase/queries/audit_payout_subsystem_convergence_phase11.sql` (P6/P7 + Phase 12 P8)
- `apps/web/lib/payout/bookingPayableForWeeklyBatch.ts`

**Next:** **Phase 15A** — `docs/payout-phase15a-measurement-before-enforcement.md` (after sign-off in §7 when org requires it); §5.1 summary remains; execution detail is in the 15A doc.
