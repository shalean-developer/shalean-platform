-- BILL-INV-002 masked production financial probes (aggregates only)

select 'invoice_status_counts' as probe, status, count(*)::int as n
from public.monthly_invoices
group by status
order by status;
