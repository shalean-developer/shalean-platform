-- BILL-INV-002 masked production financial probes (aggregates only)

select 'invoice_status_counts' as probe, status, count(*)::int as n
from public.monthly_invoices
group by status
order by status;

select 'financial_integrity' as probe,
  count(*) filter (where balance_cents < 0)::int as neg_balance,
  count(*) filter (where amount_paid_cents > total_amount_cents and total_amount_cents > 0)::int as overpay,
  count(*) filter (where coalesce(total_amount_cents,0) = 0 and lower(coalesce(status,'')) <> 'draft')::int as zero_non_draft,
  count(*) filter (where balance_cents is distinct from greatest(0, coalesce(total_amount_cents,0) - coalesce(amount_paid_cents,0)))::int as bal_mismatch,
  count(*) filter (where is_closed and balance_cents > 0)::int as closed_unpaid,
  count(*) filter (where currency is not null and upper(currency) <> 'ZAR')::int as non_zar,
  count(*) filter (
    where paystack_reference is null
      and lower(coalesce(status,'')) in ('sent','partially_paid','overdue','paid')
  )::int as missing_ref_sentish,
  count(*) filter (
    where payment_link is null
      and balance_cents > 0
      and lower(coalesce(status,'')) in ('sent','partially_paid','overdue')
  )::int as missing_link_open,
  count(*) filter (
    where zoho_invoice_id is null
      and lower(coalesce(status,'')) in ('sent','partially_paid','overdue','paid')
  )::int as missing_zoho_sentish,
  count(*) filter (
    where is_overdue and balance_cents > 0
      and lower(coalesce(status,'')) not in ('paid','refunded')
  )::int as overdue_flag_open,
  round(sum(coalesce(total_amount_cents,0)) / 100.0)::bigint as sum_total_zar,
  round(sum(coalesce(amount_paid_cents,0)) / 100.0)::bigint as sum_paid_zar,
  round(sum(coalesce(balance_cents,0)) / 100.0)::bigint as sum_balance_zar,
  count(*)::int as invoice_count
from public.monthly_invoices;

select 'dup_paystack_refs' as probe, count(*)::int as duplicate_ref_groups
from (
  select paystack_reference
  from public.monthly_invoices
  where paystack_reference is not null and btrim(paystack_reference) <> ''
  group by paystack_reference
  having count(*) > 1
) d;

select 'ledger_monthly' as probe,
  count(*)::int as payment_transactions_monthly
from public.payment_transactions
where entity_type = 'monthly_invoice';

select 'charge_dedup' as probe, count(*)::int as n
from public.monthly_invoice_paystack_charge_dedup;

select 'multi_charge_invoices' as probe,
  count(*) filter (where c > 1)::int as invoices_with_multiple_charges,
  coalesce(max(c),0)::int as max_charges_on_one
from (
  select invoice_id, count(*)::int as c
  from public.monthly_invoice_paystack_charge_dedup
  group by invoice_id
) x;

select 'paid_without_ledger' as probe, count(*)::int as n
from public.monthly_invoices mi
where lower(coalesce(mi.status,'')) = 'paid'
  and not exists (
    select 1 from public.payment_transactions pt
    where pt.entity_type = 'monthly_invoice' and pt.entity_id = mi.id
  );

select 'paid_invoice_pending_monthly' as probe, count(*)::int as n
from public.bookings b
join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
where lower(coalesce(mi.status,'')) = 'paid'
  and lower(coalesce(b.payment_status,'')) = 'pending_monthly'
  and lower(coalesce(b.status,'')) <> 'cancelled';

select 'eligible_without_full_settlement' as probe, count(*)::int as n
from public.bookings b
join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
where lower(coalesce(b.payout_status,'')) = 'eligible'
  and lower(coalesce(b.status,'')) <> 'cancelled'
  and (
    lower(coalesce(mi.status,'')) <> 'paid'
    or lower(coalesce(b.payment_status,'')) <> 'success'
  );

select 'cron_latest_billing' as probe, job_name, status, started_at, finished_at
from (
  select distinct on (job_name)
    job_name, status, started_at, finished_at
  from public.cron_runs
  where job_name in (
    'charge-monthly-invoices',
    'finalize-monthly-invoices',
    'send-invoice-reminders',
    'mark-monthly-invoices-overdue',
    'accounting-sync',
    'repair-monthly-payment-state-drift',
    'generate-recurring-bookings'
  )
  order by job_name, started_at desc nulls last
) t
order by job_name;

select 'cron_targets' as probe,
  singleton,
  case when app_base_url is null or app_base_url = '' then null
       else split_part(replace(replace(app_base_url,'https://',''),'http://',''),'/',1) end as app_host,
  case when edge_base_url is null or edge_base_url = '' then null
       else split_part(replace(replace(edge_base_url,'https://',''),'http://',''),'/',1) end as edge_host,
  updated_at
from public.cron_http_targets;

select 'accounting_sync' as probe, entity_type, sync_status, count(*)::int as n
from public.accounting_sync_records
group by entity_type, sync_status
order by entity_type, sync_status;

select 'pg_cron_billing_jobs' as probe, jobname, schedule, active
from cron.job
where jobname in (
  'charge-monthly-invoices',
  'send-invoice-reminders',
  'mark-monthly-invoices-overdue',
  'repair-monthly-payment-state-drift',
  'accounting-sync',
  'generate-recurring-bookings',
  'payment-recovery'
)
order by jobname;
