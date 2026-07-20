select 'financial_integrity' as probe,
  count(*) filter (where balance_cents < 0)::int as neg_balance,
  count(*) filter (where amount_paid_cents > total_amount_cents and total_amount_cents > 0)::int as overpay,
  count(*) filter (where coalesce(total_amount_cents,0) = 0 and lower(coalesce(status,'')) <> 'draft')::int as zero_non_draft,
  count(*) filter (where balance_cents is distinct from greatest(0, coalesce(total_amount_cents,0) - coalesce(amount_paid_cents,0)))::int as bal_mismatch,
  count(*) filter (where is_closed and balance_cents > 0)::int as closed_unpaid,
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
