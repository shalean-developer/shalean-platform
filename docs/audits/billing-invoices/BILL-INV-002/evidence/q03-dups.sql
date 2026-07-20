select 'dup_paystack_refs' as probe, count(*)::int as duplicate_ref_groups
from (
  select paystack_reference
  from public.monthly_invoices
  where paystack_reference is not null and btrim(paystack_reference) <> ''
  group by paystack_reference
  having count(*) > 1
) d;
