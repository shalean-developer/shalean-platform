select 'zero_non_draft' as probe, status, count(*)::int as n,
  count(*) filter (where balance_cents = 0)::int as zero_balance,
  count(*) filter (where is_closed)::int as closed_n
from public.monthly_invoices
where coalesce(total_amount_cents,0) = 0 and lower(coalesce(status,'')) <> 'draft'
group by status;
