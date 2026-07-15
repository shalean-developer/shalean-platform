# PRINCESS-UAT-PRC — Payment Webhooks, Recovery, and Duplicate-Protection Audit

| Field | Value |
|-------|-------|
| **Ticket** | PRINCESS-UAT-PRC |
| **Branch** | `fix/princess-prc-payment-webhook-integrity` |
| **Base** | `staging` |
| **Date (UTC)** | 2026-07-15 |
| **Staging** | https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app |
| **Staging Supabase** | `gbgnemlpyykyhpqqbgru` |
| **Paystack** | test |
| **Outbound messaging** | suppressed |
| **Production** | `tchayecuvzssixyxlvfu` — unchanged |

---

# Executive Decision

**PASS — PRINCESS PR C READY FOR REVIEW**

Signature verification is strict; duplicate webhook delivery is reference-keyed and idempotent; amount/currency/booking mismatches are rejected or quarantined; callback/webhook ordering converges to one settlement; cancelled/expired recovery remains on `/pay/{id}`; all local gates passed; staging replay proved one settlement with no ledger duplication; production was not modified.

---

# Payment State Inventory

## Authoritative routes

| Route | Role |
|-------|------|
| `POST /api/paystack/initialize` | Creates/updates `pending_payment` + Paystack auth URL |
| `POST /api/paystack/webhook` | **Authoritative** charge finalizer (`charge.success`) |
| `GET/POST /api/paystack/verify` | Callback/verify fallback finalizer |
| `POST /api/payments/verify` | Legacy verify alias (same pipeline) |
| `GET /api/booking/status` | Polling only — no booking writes |
| `POST /api/webhooks/paystack` | Transfer/payout rail only (ignores `charge.*`) |
| `/pay/[bookingId]` + `ensureBookingPaymentSession` | Abandoned/expired recovery |

## Settlement helpers

- `finalizePaidBooking` → `finalizePaystackChargeSuccess` → `upsertBookingFromPaystack`
- Ledger: `recordPaystackBookingPayment` / `recordGatewayPayment` unique on `(gateway, gateway_reference)`
- Amount gate: `isPaymentAmountMismatchZar` (1 ZAR epsilon)
- Currency gate: `isCheckoutCurrencyZar` (ZAR only) — **added this PR**
- Booking ownership: metadata `booking_id` must not disagree with row matched by `paystack_reference` — **added this PR**

## Booking / payment states

| State | Meaning |
|-------|---------|
| `pending_payment` | Awaiting Paystack |
| `payment_expired` | Link/session expired; recoverable via `/pay/{id}` |
| `payment_mismatch` | Hard quarantine (amount **or** currency) |
| `payment_reconciliation_required` | Finalize threw / terminal recovery |
| Post-pay lifecycle | `pending` / `confirmed` / `assigned` / … |
| `payment_status` | `pending` → `success` (prepaid SoT); `failed`; `pending_monthly`; refund paths where supported |

## Payment-attempt soft state

Not a DB enum. Tracked via:

- Current `paystack_reference`, `payment_link`, `payment_link_expires_at`
- `booking_snapshot.payment_attempt_history[]` (abandoned/replaced attempts)
- API shapes: `ready` | `paid` | `failed`

## Idempotency keys

| Mechanism | Key |
|-----------|-----|
| Booking settle | Unique `paystack_reference` + skip when `status ≠ pending_payment` |
| Ledger | Unique `(gateway, gateway_reference)` |
| Notifications | Claim by Paystack **reference** + event + channel |
| Canonical event | `externalRef: paystackReference` |
| Ensure session | In-process inflight + DB claim on `pending_payment\|payment_expired` |

**Not used as settle lock:** Paystack webhook `data.id` / event id (logged for observability only).

## Signature

- Header: `x-paystack-signature`
- HMAC-SHA512 of **raw body** with `PAYSTACK_SECRET_KEY`
- Timing-safe compare; missing **or** invalid → **401**

## State-transition matrix

| From \ Event | Valid init | Charge success | Duplicate charge.success | Amount/currency mismatch | Cancel / abandon | Expire cron | Charge failed |
|--------------|------------|----------------|--------------------------|--------------------------|------------------|-------------|----------------|
| (none) | → `pending_payment` | — | — | — | — | — | — |
| `pending_payment` | reuse / rotate attempt | → settled lifecycle + `payment_status=success` | skip finalize | → `payment_mismatch` | stays pending; recovery via `/pay` | → `payment_expired` | ops alert; no settle |
| `payment_expired` | new session via ensure | settle if paid | skip if already left pending | quarantine if pending | recover | stay / recover | — |
| Settled (non-pending) | return `paid` | idempotent skip + ledger upsert | idempotent | no re-settle | — | — | — |
| `payment_mismatch` | ops / recovery | replay returns mismatch | no settle | terminal until ops | — | — | — |

Refunded / chargeback: dispute events → `markBookingChargeback` (existing); not expanded in this PR.

Finance source of truth unchanged (`payment_status`, `amount_paid_cents`, `payment_transactions`).

---

# Webhook Contract

Local deterministic suite: `apps/web/app/api/paystack/webhook/__tests__/princessPrcWebhookContract.test.ts`

| # | Check | Result |
|---|--------|--------|
| 1 | Valid signature accepted | PASS |
| 2 | Invalid signature → 401 | PASS |
| 3 | Missing signature → 401 | PASS |
| 4 | Unknown event → no settle | PASS |
| 5 | charge.success settles intended booking | PASS |
| 6 | Duplicate delivery idempotent | PASS |
| 7 | Different event IDs, same reference, no double-settle | PASS |
| 8 | Amount mismatch rejected | PASS |
| 9 | Currency mismatch rejected / quarantined | PASS |
| 10 | Booking reference mismatch rejected | PASS |
| 11 | Missing booking handled safely | PASS |
| 12 | Already-paid not paid again | PASS |
| 13 | Retry after temp failure remains safe | PASS |
| 14 | Logs omit secrets / auth codes | PASS |

---

# Idempotency Model

1. **Reference-keyed settlement** — Paystack `data.reference` is the settle identity.
2. **Status gate** — Any booking with `status ≠ pending_payment` skips finalize.
3. **Ledger unique index** — Second insert for same gateway reference is treated as already created.
4. **Notification claims** — `payment_confirmed` keyed by reference (no duplicate customer spam under claim).
5. **Event id** — Observability only (`gateway_event_id` in structured logs); never a second settle path.

---

# Duplicate Payment Tests

Covered by webhook contract + `princessPrcCallbackWebhookOrdering.test.ts` + existing `ensureBookingPaymentSession` / finalize suites:

- Parallel finalize same reference → reference-keyed upsert
- Callback-first then webhook → second skipped
- Webhook-first then callback → second skipped
- Double initialize / refresh / `/pay` retries → existing ensure-session tests (paid short-circuit, inflight dedupe, link reuse)

Expected invariant: one booking, one successful settlement, one ledger row per reference, no amount inflation.

---

# Callback/Webhook Ordering

| Order | Final state |
|-------|-------------|
| A. Verify (callback) then webhook | Same booking; webhook idempotent skip |
| B. Webhook then verify | Same booking; verify skip / already_processed |

Authoritative server state wins; callback UI must re-read server (existing verify/`/pay` paths).

---

# Recovery Tests

Existing PRA2 + `ensureBookingPaymentSession` coverage retained:

- Cancel on Paystack / browser back → pending booking recoverable
- Expired authorization → new session; prior attempt in history
- Failed / abandoned → verify-before-reinit where applicable
- Eventual settlement exactly once via reference uniqueness

No duplicate booking on retry.

---

# Failure Injection

| Injection | Behaviour |
|-----------|-----------|
| Upsert/finalize throw | `enqueuePaystackRecoveryFailedJobs` / `failed_jobs`; webhook still acks after signature OK |
| Amount / currency mismatch | Quarantine `payment_mismatch`; recovery enqueue once |
| Booking mismatch | Reject settle; critical ops log; no success write |
| Logging failure | Structured log best-effort; settle path not weakened |
| Duplicate during retry | Status + ledger uniqueness |
| Malformed metadata | Decoupled metadata assert / missing snapshot fail-safe |

Operators distinguish mismatch (permanent quarantine) vs reconcile (retryable failed_jobs) via `reason` + `failed_jobs.type`.

---

# Observability

Structured `payment_webhook_outcome` fields (safe):

- `event`, `outcome`, `rejection_reason`, `idempotency_result`
- `reference_masked`, `booking_id`, `gateway_event_id`
- `settlement_at` on settle

Not stored in these logs: full card details, secret keys, complete signed payloads, authorization codes, recovery tokens.

Helpers: `maskPaystackReference`, existing `redactOperationalContext`.

---

# Local Validation

| Gate | Result | Evidence |
|------|--------|----------|
| PR C targeted (webhook + ordering) | PASS | `evidence-prc-payment-critical.txt` |
| `test:critical` (56 tests) | PASS | `evidence-prc-test-critical.txt` |
| Full Vitest (524 files / 3264 tests) | PASS | `evidence-prc-vitest-full.txt` |
| `npm run typecheck` | PASS | `evidence-prc-typecheck.txt` |
| `lint:booking-core` | PASS | `evidence-prc-lint-booking-core.txt` |
| `db:migrations:validate` | PASS | `evidence-prc-migration-validate.txt` |
| `next build --webpack` | PASS | `evidence-prc-next-build.txt` |

Remediations in this PR:

1. Hard currency gate in `upsertBookingFromPaystack` (`currency_mismatch` → `payment_mismatch` quarantine)
2. Booking metadata vs reference ownership mismatch rejection
3. Webhook structured outcomes with masked references
4. Contract + ordering automated tests wired into `test:critical`

---

# Staging Integration Check

Script: `scripts/env/princess-prc-staging-integration.mjs`  
Evidence: `docs/audits/uat/princess/evidence/prc-staging-integration-2026-07-15T2252Z.json`

| Check | Result |
|-------|--------|
| Environment identity (`gbgnemlpyykyhpqqbgru`, Paystack test, outbound disabled) | PASS |
| Invalid signature → 401 | PASS |
| Missing signature → 401 | PASS |
| Unknown event signed ack | PASS |
| Initialize route reachable (400 incomplete body, not 503) | PASS |
| Webhook replay on already-paid booking | **one settlement**; ledger rows 1→1; amount unchanged |
| Production writes | None |

Fresh end-to-end charge UI was not re-run in this ticket (PRA already proved initialize → cancel recovery → successful settlement). PR C staging focus = webhook integrity + settle-once replay on live staging test mode.

---

# Production Non-Impact

- No production deploy / promote
- No production DB writes
- Branch targets `staging` only
- Local production keys file absent; probe skipped with explicit note

---

# Remaining Risks

1. **Currency/booking mismatch remediations** ship with this PR; staging currently runs pre-merge code for those gates — re-verify once PR merges to staging.
2. Webhook handler returns **200 after signature OK** even when finalize fails (Paystack will not backoff); recovery relies on `failed_jobs` + ops — intentional, documented.
3. Soft pricing mismatch metrics (`recordPaystackPricingMismatch`) remain telemetry-only; hard gate stays in upsert.
4. Full browser charge + dual callback/webhook on a brand-new booking still recommended as post-merge Princess retest.

---

# Princess Retest Checklist

- [ ] Merge PR C to staging only (manual)
- [ ] Re-run `princess-prc-staging-integration.mjs` after merge
- [ ] One fresh synthetic booking → Paystack test pay → callback → webhook
- [ ] Replay same webhook once → confirm still one ledger row
- [ ] Cancelled Paystack → `/pay/{id}` recovery → eventual single settle
- [ ] Confirm production ref `tchayecuvzssixyxlvfu` unchanged
- [ ] Do **not** start PR D / PR E until Princess signs off PR C
