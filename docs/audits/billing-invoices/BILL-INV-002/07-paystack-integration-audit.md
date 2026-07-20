# 07 — Paystack Integration Audit

## Initialize

| Check | Result |
|-------|--------|
| Amount in cents | Yes — `balance_cents` |
| Currency ZAR | Yes — hardcoded |
| Reference uniqueness | DB unique on `paystack_reference`; post-send uses `_b{balance}` suffix |
| Metadata | Includes `shalean_monthly_invoice_id`, `amount_due_cents` (informational) |
| Persist-before-init | Yes — reference written before Paystack call |

## Webhook

| Check | Result |
|-------|--------|
| Signature | HMAC-SHA512 + timing-safe compare |
| Trust model | Signed body; metadata is hint only |
| Routing | `routePaystackChargeForMonthlyInvoice` shared with verify |
| Ledger write | `recordPaystackMonthlyInvoicePayment` after settle / already_processed |
| Logs | Some paths log full `reference` (PII/capability) |

## Verify / callback

- Same monthly routing helper — race-safe with dedup.
- Success page treats any `monthly_invoice*` state as “paid” including partial (**M09**).

## Amount / currency / ownership match

| Check | Result |
|-------|--------|
| Currency | Init ZAR; apply does not re-assert currency from charge |
| Amount == remaining balance | **Not enforced** (**C01**) |
| Wrong amount quarantine | **No** — underpay→partial, overpay capped at total |
| Ownership | Resolved via stored ref / `mi_inv_{uuid}` parse / hint |

## Idempotency

- `monthly_invoice_paystack_charge_dedup` unique on charge reference — duplicate harmless.
- Ledger unique on `(gateway, gateway_reference)`.

## Partial payments

Supported in apply; children settle only on full. Prod multi-charge count = 0 today.

## Failures / abandoned

Observable via Paystack + system logs; no dedicated abandoned-checkout office queue for monthly invoices.

## Booking fall-through

On `monthly_error`, webhook may fall through to booking pipeline (documented) — noise risk for `mi_inv_*` refs (**M10**).
