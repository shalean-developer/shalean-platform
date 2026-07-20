# 04 — Page and UX Audit

## Browser limitation (verified)

Unauthenticated visits to `/office/billing` and `/office/invoices` redirect to `/login?redirect=…`. Authenticated office UX was audited from source at SHA `c2c04d42`.

Public `/pay/invoice/{uuid}` without `ref` shows **Payment link incomplete** / “Open the pay link from your invoice email.” — verified in browser.

## `/office/billing` (Zoho sync hub)

| Area | Assessment |
|------|------------|
| Purpose | Aggregate “missing Zoho” across quotes, sales invoices, booking invoices, monthly invoices |
| Loader | `loadAdminBillingDocuments.ts` — caps 300/300/200 sources, returns slice of 250 |
| Actions | Sync / retry via `/api/admin/billing-documents/sync` |
| Risk | Backlog understated when >250 need sync (**BILL-INV-002-M03**) |
| Auth | Office shell `requiredRole: admin` + API `requireAdminApi` |

## `/office/invoices`

| Control | Status | Notes |
|---------|--------|-------|
| Month grouping / filters / search | Functional (code) | List loaded via `/api/admin/invoices` |
| KPI summaries | Functional on filtered set | Hard cap **500** invoices before filter (**M02**) |
| Pagination | Functional | After in-memory filter |
| Export button | **Non-functional** | No `onClick` (**M01**) |
| Detail navigation | Functional in office page | Legacy `AdminInvoicesListView` links `/admin/invoices/…` (**M04**) |
| Error / retry | Present | Banner + refetch |
| Empty / loading | Present | Standard office patterns |

## Invoice detail actions (`InvoiceHeaderActions`)

| Action | Functional? | Notes |
|--------|-------------|-------|
| Send / finalize | Yes | Admin send API |
| Resend email | Yes | |
| Resend WhatsApp | Yes | Meta Cloud API path |
| Copy payment link | Yes but raw Paystack URL | **H03** — not branded |
| Mark paid | Yes | Manual offline settlement |
| Refund | Yes | Multi-charge incomplete (**H02**) |
| Hard close | Yes | RPC path |
| Sync Zoho | Yes | |
| Sync payment | Yes | Paystack verify/admin sync |
| PDF | Yes | Cookie admin session |
| Header WhatsApp | Chat only | Does not send invoice (**L01**) |

## Customer surfaces

| Surface | Notes |
|---------|-------|
| `/account/invoices` | Ownership-gated PDFs |
| `InvoiceCard` pay CTA | Uses raw `payment_link` (**H03**) |
| `/pay/invoice/[id]` | Requires matching `paystack_reference` |

## UX accuracy conclusion

Office invoices are operationally usable for send / mark-paid / adjust / Zoho sync. The Export button is misleading. KPI and Zoho-inbox caps can hide scale. Copy-link behaviour contradicts branded-link policy used in email.
