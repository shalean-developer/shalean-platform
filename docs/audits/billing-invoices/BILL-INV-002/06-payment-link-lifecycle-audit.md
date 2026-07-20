# 06 — Payment-Link Lifecycle Audit

## Creation paths

| Path | Behaviour |
|------|-----------|
| Finalize / send cron | `initializePaystackForMonthlyInvoice` for `balance_cents` |
| Public landing (empty link) | Re-inits Paystack when `payment_link` null |
| Admin resend | Uses existing or re-init flows in send/resend routes |
| Draft reuse | May reuse existing authorization URL without amount verify |

## Communication surfaces

| Surface | URL type | Verdict |
|---------|----------|---------|
| Invoice email HTML | Branded `/pay/invoice/…?ref=` (Paystack fallback suppressed off-domain) | Good |
| Reminders | Branded (when cron runs) | Good design / cron broken |
| Admin copy link | **Raw** `payment_link` (Paystack) | Fail policy |
| Customer `InvoiceCard` | **Raw** `payment_link` | Fail policy |
| Zoho notes | May embed payment URL | Review |

## Binding and security

- Public page requires `ref` matching stored `paystack_reference` (403 on mismatch) — **verified**.
- UUID alone insufficient — **verified** (incomplete without ref).
- Capability is the Paystack reference (treat as secret-ish).

## Amount integrity (critical)

| Step | Amount source |
|------|---------------|
| Display on landing | Current `balance_cents` |
| Checkout session | Amount frozen at Paystack initialize |
| Apply on success | Paystack charge amount; **no compare to current balance** |

Late fee clears `payment_link`. Manual adjustments do **not** clear it.

**Result:** UI can show R X while Paystack charges R Y (**C01**).

## Superseded / paid / zero

| Condition | Behaviour |
|-----------|-----------|
| Paid | Landing 410 |
| Zero balance | Landing 410 / init `invoice_nothing_due` |
| Status not payable | Rejected in apply |
| Older `_b{balance}` refs | New refs for new inits; **old Paystack sessions remain completable until PS expiry** |
| Failed init after draft→sent | Status can be `sent` before email (**M08**) |

## Copy / resend

- Copy does not construct branded URL.
- Resend should refresh intent — partially true via init helpers; not guaranteed if stored link still present with drifted balance.

## Direct Paystack bypass

Inherent once `authorization_url` is issued. Product currently **encourages** bypass via copy + InvoiceCard.
