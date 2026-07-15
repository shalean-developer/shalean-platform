# PRINCESS-UAT-PRD — Refund Workflow and Financial Reconciliation Audit

| Field | Value |
|-------|-------|
| **Ticket** | PRINCESS-UAT-PRD |
| **Branch** | `fix/princess-prd-refund-reconciliation` |
| **Base** | `staging` |
| **Date (UTC)** | 2026-07-16 |
| **Staging** | https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app |
| **Staging Supabase** | `gbgnemlpyykyhpqqbgru` |
| **Paystack** | test (no live refund executed in this PR) |
| **Outbound messaging** | suppressed |
| **Production** | `tchayecuvzssixyxlvfu` — unchanged |

---

# Executive Decision

**PASS — PRINCESS PR D READY FOR REVIEW**

Full and partial booking refunds are governed by a formal amount/state contract; cumulative partials are supported; over-refunds and duplicate full refunds are rejected; maker–checker can be enabled without schema migration; refund ledger lines are separate from immutable captures; admin UI is wired; customer payment badges distinguish refund states; local gates passed; staging used a documented **simulation** (no real refund); production was not modified.

---

# Existing Capability Inventory

| Capability | Classification | Notes |
|------------|----------------|-------|
| `POST /api/admin/bookings/[id]/refund` | **complete** (hardened) | Full/partial, maker-checker, retry, record_only |
| `POST /api/admin/invoices/[invoiceId]/refund` | **partial** | Full only; unchanged this PR (invoice path) |
| `POST /api/admin/sales-documents/[id]/refund` | **partial** | Full only; unchanged this PR |
| `refundPaystackTransaction` | **partial** → used safely | Explicit cents always sent for cumulative partials |
| `bookings.refunded_at` / `refund_status` | **partial** | Existing columns; workflow detail in snapshot |
| Dedicated `refunds` table / `amount_refunded_cents` column | **missing** (deferred) | No remote migration; see Remaining Risks |
| `payment_transactions` refund lines | **complete** (new) | `recordGatewayRefund` → `settlement_status=reversed` |
| Booking operational `status` auto-cancel on refund | **missing** (by policy) | APPROVAL_REQUIRED — refund ≠ cancel |
| Invoice / Zoho credit note | **missing** (interim documented) | Does not block internal refund |
| Admin dual-gate (`requireAdminApi`) | **complete** | Unchanged |
| Maker–checker for refunds | **complete** (new) | Snapshot proposals; `REFUND_MAKER_CHECKER` / `PAYOUT_MAKER_CHECKER` |
| Refund webhooks (`refund.processed` etc.) | **complete** (new) | Confirms pending/submitted; idempotent |
| Customer notifications (email/push) | **missing** (interim UX copy) | Dashboard badges + timing guidance |
| Admin booking Refund UI | **complete** (wired) | Was unused; now `AdminBookingRefundDialog` |
| Customer `/account/payments` refund labels | **complete** | Fully / Partially refunded |
| Chargeback via dispute webhooks | **partial** | Existing; payment_status now `refunded` |

---

# Approved Refund Rules

| Rule | Decision |
|------|----------|
| Full refund | Refunds **remaining refundable** (= captured − prior succeeded refunds) |
| Partial refund | Any amount `1…refundable` inclusive |
| Maximum refundable | Captured cash only (`amount_paid` / workflow `captured_cents`) |
| Service fee handling | **Not separated** — refund base is net captured cash. APPROVAL_REQUIRED if fees must be withheld differently |
| Discounts / credits / extras | Included in captured net; no separate clawback math in this PR |
| Already-refunded | Further refunds blocked when aggregate is full / chargeback / reversed |
| Cancellation reason | Optional field on request; **does not** auto-cancel booking |
| Refund reason | Required in admin UI; stored on refund record + system log |
| Authorization | Admin allowlist only (Gate B API). Customer/cleaner denied |
| Maker–checker | When `REFUND_MAKER_CHECKER=true` or `PAYOUT_MAKER_CHECKER=true`: propose → different admin approve. Self-approve rejected unless `REFUND_ALLOW_SELF_APPROVE=true` |
| Customer notification | Interim: dashboard state + copy (no outbound email in this PR; messaging suppressed on staging) |
| Financial reporting | Refund ledger lines + `refund_status`; dashboard revenue already excludes refund statuses |
| Invoice / credit note | **Interim:** internal booking/payment state only. Zoho credit note **out of scope** — APPROVAL_REQUIRED for accounting sync |

---

# Refund State Machine

Provider workflow states (per refund record in `booking_snapshot.refund_workflow`):

`not_requested → requested → approved → submitted_to_provider → pending → succeeded | failed`

Also: `failed → submitted_to_provider` (retry); `requested|approved → cancelled`.

Terminal: `succeeded`, `cancelled`.

Booking aggregate (`refund_status`): `partial` | `full` | `chargeback`.

Payment status: full/chargeback → `refunded`; partial keeps paid-like status with reduced remaining cents. **Never** shows as simply “Paid” when fully refunded.

---

# Authorization and Approval

| Action | Who |
|--------|-----|
| Request refund | Allowlisted admin |
| Approve (maker–checker on) | Different allowlisted admin |
| Submit to Paystack | Same apply path after approve/direct |
| Retry failed | Allowlisted admin (`retry_refund_id`) |
| Cancel pending proposal | Expiry (24h) or overwrite via new propose flow |
| View details | Admin booking detail (timeline + dialog) |
| Customer / cleaner | Denied (no public refund API) |

Dual-gate preserved: UI role + `requireAdminApi` allowlist.

---

# Provider Contract

- Pre-check reverse state; treat already-reversed as success.
- Always pass **explicit** `amount` cents (never omit after partials).
- Claim local `submitted_to_provider` **before** provider call.
- On failure: record stays `failed`; booking not marked refunded; retry allowed.
- Webhooks: `refund.processed` / `refund.pending` / `refund.failed` / `charge.refunded`.
- Sanitized outcomes only in snapshot/logs.

Local suite: `lib/booking/refund/__tests__/princessPrdRefundContract.test.ts`.

---

# Ledger Reconciliation

- Original `payment_transactions` capture row remains immutable.
- Each succeeded refund inserts `gateway_reference = refund:{charge}:{refundId}` with `settlement_status=reversed`.
- Assertions: no over-refund; currency consistent; unique refund refs; sum(refund lines) = refunded cents.
- Module: `refundReconciliation.ts` + `recordGatewayRefund.ts`.

---

# Booking and Customer States

| Scenario | Booking `status` | Payment | Customer badge |
|----------|------------------|---------|----------------|
| Partial refund | Unchanged (may stay completed) | `success` + `refund_status=partial` | Partially refunded |
| Full refund | Unchanged unless ops cancel separately | `refunded` + `refund_status=full` | Fully refunded |
| Chargeback | Unchanged | `refunded` + `chargeback` | Chargeback |
| Payout | Blocked by existing refund integrity gates | — | — |

Rebooking eligibility: unchanged (not auto-blocked). APPROVAL_REQUIRED if full refund must freeze rebook.

---

# Invoice/Credit-Note Handling

| Item | Status |
|------|--------|
| Internal Shalean credit note entity | **Missing** — interim: booking refund workflow + payment badges |
| Zoho credit notes | **Missing** — do not block refund |
| Invoice status change on booking refund | N/A for prepaid booking path |
| Monthly invoice refund | Existing full-refund path retained; not expanded this PR |
| Zoho unavailable | Internal refund proceeds |

---

# Admin and Customer UX

**Admin:** Booking actions → Refund dialog shows paid / prior / max refundable, full vs partial, reason, record-only, proposal id, provider timing note. Timeline shows refund step.

**Customer:** `/account/payments` badges + guidance (5–10 business days). No payment-provider brand required in badge text.

---

# Observability

Structured events: `payment_refund_proposed` | `payment_refund_succeeded` | `payment_refund_failed` | `payment_refund_webhook`.

Logged: masked reference, refund id, booking id, amount, currency, state, operator, approval, sanitized outcome, retry count, timestamp.

Never logged: secret keys, full provider payloads, card data, auth codes, JWTs.

---

# Local Validation

| Gate | Result | Evidence |
|------|--------|----------|
| PR D contract tests | PASS | `evidence-prd-payment-critical.txt` |
| `test:critical` | PASS (75) | `evidence-prd-test-critical.txt` |
| Full Vitest | PASS (3285) | `evidence-prd-vitest-full.txt` |
| Typecheck | PASS | `evidence-prd-typecheck.txt` |
| `lint:booking-core` | PASS | `evidence-prd-lint-booking-core.txt` |
| Migration validate | PASS (no new remote migration) | `evidence-prd-migration-validate.txt` |
| `next build --webpack` | PASS | `evidence-prd-next-build.txt` |

---

# Staging Integration

**Mode:** Documented simulation — **no real Paystack refund executed** (task forbids creating/executing real refunds).

Script: `scripts/env/princess-prd-staging-simulation.mjs`

Verified:

- Staging Supabase ref `gbgnemlpyykyhpqqbgru`
- Production ref distinct `tchayecuvzssixyxlvfu`
- Refund admin route reachable and rejects unauthenticated calls
- Provider behaviour proven by local mocked contract suite

Evidence: `docs/audits/uat/princess/evidence/prd-staging-simulation-*.json`

---

# Production Non-Impact

- Branch targets **staging** only
- No production deploy / promote
- No production DB writes
- No Paystack live mode
- No real refunds

---

# Remaining Risks

1. **No first-class `booking_refunds` table / `amount_refunded_cents` column** — workflow in JSON snapshot; optional migration needs separate approval.
2. **Invoice/sales-document refunds** still full-only; not brought to PR D booking parity.
3. **Zoho credit notes** not implemented — finance ops must reconcile manually interim.
4. **Refund ≠ cancel** — ops must cancel booking separately if service must stop.
5. **Paystack test refund not live-proven** on staging in this PR (explicit simulation).
6. Concurrent double-submit race: mitigated by claim-before-provider + ledger unique ref; DB advisory lock would harden further (future).

---

# Princess Retest Checklist

- [ ] Enable `REFUND_MAKER_CHECKER=true` on staging preview; propose + approve with two admins
- [ ] After preview deploy: one **Paystack test-mode** partial then completing partial on a fresh synthetic paid booking (separate ops approval)
- [ ] Confirm webhook `refund.processed` updates pending record
- [ ] Confirm customer payments badge + admin timeline
- [ ] Confirm `payment_transactions` has one reversed line per refund id
- [ ] Confirm production project untouched
- [ ] Do **not** start PR E until this PR is reviewed

---

# Key code

- `apps/web/lib/booking/refund/*`
- `apps/web/app/api/admin/bookings/[id]/refund/route.ts`
- `apps/web/app/api/paystack/webhook/route.ts` (refund events)
- `apps/web/components/admin/AdminBookingRefundDialog.tsx`
- `apps/web/lib/dashboard/customerPaymentDisplay.ts`
