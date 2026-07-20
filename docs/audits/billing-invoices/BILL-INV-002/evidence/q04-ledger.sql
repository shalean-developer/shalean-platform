select 'ledger_and_dedup' as probe,
  (select count(*)::int from public.payment_transactions where entity_type = 'monthly_invoice') as payment_transactions_monthly,
  (select count(*)::int from public.monthly_invoice_paystack_charge_dedup) as charge_dedup,
  (select count(*)::int from (
     select invoice_id from public.monthly_invoice_paystack_charge_dedup group by invoice_id having count(*) > 1
   ) m) as invoices_with_multiple_charges,
  (select coalesce(max(c),0)::int from (
     select count(*)::int as c from public.monthly_invoice_paystack_charge_dedup group by invoice_id
   ) x) as max_charges_on_one;
