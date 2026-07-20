# 10 — Notification and Reminder Audit

## Email (initial / resend)

| Check | Result |
|-------|--------|
| Recipient resolution | `resolveMonthlyInvoiceCustomerEmail` |
| Balance / due date | Included from invoice row at send time |
| Branded payment URL | Primary; off-domain Paystack suppressed in HTML helper |
| PDF attachment | Zoho when available |
| HTML escaping | Template helpers (standard) |
| Idempotent initial claim | `initial_invoice_email_dispatch_claimed` |
| Failed email | Claim released; status may already be `sent` (**M08**) |
| Resend | Auditable admin action + events |

## WhatsApp

- Admin resend channel via Meta Cloud API.
- Header WhatsApp is chat deep-link only (**L01**).
- Reminder path includes WhatsApp when cron executes.

## Reminders

| Design | Code |
|--------|------|
| Cadence | Days 3 / 7 / 14 past due |
| Eligibility | `balance_cents > 0`, status ∈ `{sent, partially_paid}`, not closed |
| Paid/refunded | Excluded by status filter |
| `overdue` status | **Not** in eligibility set (**M13**) |

## Production execution gap (verified)

| Job | pg_cron | cron_runs |
|-----|---------|-----------|
| `send-invoice-reminders` | active `0 9 * * *` | **0 rows ever** |
| `mark-monthly-invoices-overdue` | active `0 10 * * *` | **0 rows** |
| `charge-monthly-invoices` | active | 66 success rows |

**H05:** Reminder and overdue automation are scheduled in Postgres but show no successful application `cron_runs`. Customers are not receiving automated overdue escalation from this path today.

## Safety during audit

No messages sent. Outbound messaging is enabled in production env (`outboundDisabled: false`).
