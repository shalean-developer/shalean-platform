# 09 — Zoho and PDF Audit

## Sync behaviour

- `syncMonthlyInvoiceToZohoBooks` during finalize — **non-blocking** on failure (`zoho_sync_failed_email_continues`).
- Payment collection proceeds without Zoho — intentional resilience.
- Reuses `zoho_invoice_id` when present; create race can still duplicate (**M12**).

## Production Zoho state

| Probe | Value |
|------:|------|
| Missing `zoho_invoice_id` on sent/partial/overdue/paid | 3 |
| `accounting_sync_records` | 21 pending (expense 14, payment_transaction 6, vendor 1); **0 synced** |
| `accounting-sync` pg_cron job | **Absent** |
| Office billing inbox | Manual sync path remains |

## PDF

| Route | Auth |
|-------|------|
| Admin invoice PDF | Cookie `isAdmin` |
| Customer monthly PDF | `customer_id = auth user` |
| Email attachment | Zoho PDF when id present |

## Payment link on Zoho

Zoho may include payment URL in notes — ensure branded URL preference (**L03**).

## Drift

- Local paid + Zoho unpaid possible when `markZohoInvoicePaid` fails (logged, non-blocking).
- Admin **Sync payment** / **Sync Zoho** are recovery controls.
- Accounting queue stagnation means fee/expense sync to Zoho is not automated (**H04**).

## Conclusion

Zoho failure does **not** block collection (good for cash). Accounting completeness is **not** guaranteed; operator must use `/office/billing` until `accounting-sync` is scheduled and draining.
