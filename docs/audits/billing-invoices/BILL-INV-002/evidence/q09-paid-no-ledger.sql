select 'paid_without_ledger_breakdown' as probe,
  count(*) filter (where paystack_reference is null)::int as no_paystack_ref,
  count(*) filter (where paystack_reference is not null)::int as has_paystack_ref,
  count(*) filter (where payment_link is not null)::int as has_payment_link,
  count(*) filter (where zoho_invoice_id is not null)::int as has_zoho
from public.monthly_invoices mi
where lower(coalesce(mi.status,'')) = 'paid'
  and not exists (
    select 1 from public.payment_transactions pt
    where pt.entity_type = 'monthly_invoice' and pt.entity_id = mi.id
  );
