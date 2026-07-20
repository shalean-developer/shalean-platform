# 03 — End-to-End Architecture

## Production identity

| Layer | Verified value |
|-------|----------------|
| App | `shalean.co.za` → Vercel production |
| SHA | `c2c04d42acff0e60e7b09cc604a7d042b56a2b10` |
| DB | Supabase `tchayecuvzssixyxlvfu` |
| Paystack | live |
| Cron transport | `cron_http_targets.app_base_url` host = `shalean.co.za`; pg_cron → `invoke_nextjs_cron` |

## Current end-to-end billing architecture

```mermaid
flowchart TD
  subgraph recur [Recurring generation]
    A[pg_cron generate-recurring-bookings] --> B[Booking payment_status=pending_monthly]
    B --> C[Trigger bookings_after_write_monthly_invoice]
    C --> D[Draft monthly_invoices + booking.monthly_invoice_id]
  end

  subgraph finalize [Month-end finalize]
    E[pg_cron charge-monthly-invoices] --> F[finalizeDueMonthlyInvoices]
    F --> G[initializePaystackForMonthlyInvoice]
    G --> H[Store payment_link + paystack_reference]
    H --> I[status draft to sent]
    F --> J[syncMonthlyInvoiceToZohoBooks non-blocking]
    F --> K[sendMonthlyInvoiceEmail branded URL]
  end

  subgraph pay [Customer payment]
    K --> L["/pay/invoice/id?ref="]
    L --> M[Paystack checkout session]
    M --> N[charge.success webhook]
    M --> O[Browser verify callback]
    N --> P[routePaystackChargeForMonthlyInvoice]
    O --> P
    P --> Q[applyMonthlyInvoicePayment + dedup]
    Q --> R[recordPaystackMonthlyInvoicePayment ledger]
  end

  subgraph settle [Settlement]
    Q -->|full| S[settleMonthlyInvoiceChildren]
    S --> T[booking success + payout eligible]
    Q -->|partial| U[status partially_paid]
  end

  subgraph accounting [Accounting]
    J --> V[zoho_invoice_id on row]
    R --> W[accounting_sync_records]
    W -.->|worker missing| X[accounting-sync cron ABSENT]
  end

  D --> E
```

## Invoice and payment-link state machine

```mermaid
stateDiagram-v2
  [*] --> draft: booking trigger / rollup
  draft --> sent: Paystack initialize success
  sent --> partially_paid: underpay charge
  sent --> paid: full charge or admin mark-paid
  partially_paid --> paid: remainder charge / mark-paid
  sent --> overdue: overdue cron flag/status
  partially_paid --> overdue: overdue cron
  paid --> refunded: admin refund
  paid --> [*]: is_closed auto
  note right of sent
    payment_link may become stale if totals change
  end note
```

## Paystack initialize / callback / webhook sequence

```mermaid
sequenceDiagram
  participant Cron as charge-monthly-invoices
  participant Init as initializePaystack
  participant PS as Paystack
  participant Mail as Email
  participant Pay as /pay/invoice
  participant WH as webhook
  participant Ver as /api/paystack/verify
  participant Apply as applyMonthlyInvoicePayment
  participant Led as payment_transactions

  Cron->>Init: balance_cents
  Init->>Init: persist paystack_reference
  Init->>PS: transaction/initialize ZAR cents
  PS-->>Init: authorization_url
  Init->>Init: draft→sent, store payment_link
  Cron->>Mail: branded /pay/invoice?ref=
  Pay->>PS: redirect authorization_url
  PS-->>WH: charge.success HMAC
  PS-->>Ver: browser redirect reference
  WH->>Apply: amount from Paystack
  Ver->>Apply: same path
  Apply->>Apply: dedup insert
  WH->>Led: recordPaystackMonthlyInvoicePayment
```

## Payment reconciliation and Zoho synchronization flow

```mermaid
flowchart LR
  A[Invoice paid locally] --> B{zoho_invoice_id?}
  B -->|yes| C[markZohoInvoicePaid best-effort]
  B -->|no| D[Office Zoho sync / sync-zoho API]
  E[payment_transactions] --> F[accounting_sync_records pending]
  F --> G{accounting-sync cron}
  G -->|absent in prod pg_cron| H[Queue stagnates]
  D --> I[/office/billing missing_zoho tab]
```

## Failure and recovery paths

```mermaid
flowchart TD
  F1[Init OK, email fail] --> R1[Status remains sent; claim released; resend]
  F2[Init fail] --> R2[Stay draft; cron retries]
  F3[Webhook before verify] --> R3[Dedup; verify no-ops]
  F4[Verify without webhook] --> R4[Same apply + ledger on verify]
  F5[Paid but children fail] --> R5[already_paid re-entry settles children]
  F6[Zoho fail] --> R6[Email/pay continue; office sync]
  F7[Stale Paystack session paid] --> R7[Apply accepts charge amount — RISK]
  F8[Reminder cron scheduled but no runs] --> R8[Manual resend only today]
```

## Primary code map

| Concern | Path |
|---------|------|
| Office invoices UI | `apps/web/app/(ui-redesign)/office/invoices/` |
| Office Zoho billing | `apps/web/app/(ui-redesign)/office/billing/page.tsx` |
| Finalize | `lib/monthlyInvoice/finalizeAndSendMonthlyInvoice.ts` |
| Paystack init | `lib/monthlyInvoice/initializePaystackForMonthlyInvoice.ts` |
| Apply payment | `lib/monthlyInvoice/applyMonthlyInvoicePayment.ts` |
| Public pay | `lib/pay/loadPayMonthlyInvoiceLanding.ts` |
| Webhook | `app/api/paystack/webhook/route.ts` |
| Ledger | `lib/payments/recordPaystackSettlement.ts` |
| Zoho | `lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks.ts` |
| Reminders | `lib/monthlyInvoice/runSendInvoiceReminders.ts` |
