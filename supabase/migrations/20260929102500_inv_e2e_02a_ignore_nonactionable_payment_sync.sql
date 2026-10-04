-- INV-E2E-02A: quarantine payment sync work that is structurally not applicable.
-- Applies only to booking-owned payment transactions that must never create a per-visit
-- Zoho customer payment: test bookings, monthly-billing child visits, and bookings owned
-- by a sales document.

alter table public.accounting_sync_records
  drop constraint if exists accounting_sync_records_sync_status_check;

alter table public.accounting_sync_records
  add constraint accounting_sync_records_sync_status_check
  check (sync_status = any (array['not_synced'::text,'pending'::text,'synced'::text,'failed'::text,'ignored'::text]));

alter table public.payment_transactions
  drop constraint if exists payment_transactions_sync_status_check;

alter table public.payment_transactions
  add constraint payment_transactions_sync_status_check
  check (sync_status = any (array['not_synced'::text,'pending'::text,'synced'::text,'failed'::text,'ignored'::text]));

with classified as (
  select
    pt.id as payment_transaction_id,
    case
      when b.is_test then 'booking_test'
      when b.is_monthly_billing_booking then 'booking_monthly_owned'
      when b.sales_document_id is not null then 'booking_sales_document_owned'
      else null
    end as ignore_reason
  from public.payment_transactions pt
  join public.bookings b
    on pt.entity_type = 'booking'
   and b.id = pt.entity_id
  where b.is_test
     or b.is_monthly_billing_booking
     or b.sales_document_id is not null
),
updated_payments as (
  update public.payment_transactions pt
     set sync_status = 'ignored',
         sync_errors = 'accounting_not_applicable:' || c.ignore_reason,
         updated_at = now()
    from classified c
   where pt.id = c.payment_transaction_id
     and pt.sync_status <> 'synced'
  returning pt.id
)
update public.accounting_sync_records r
   set sync_status = 'ignored',
       sync_errors = 'accounting_not_applicable:' || c.ignore_reason,
       next_retry_at = null,
       updated_at = now()
  from classified c
 where r.entity_type = 'payment_transaction'
   and r.entity_id = c.payment_transaction_id
   and r.sync_status in ('pending','failed','not_synced');
