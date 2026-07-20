select 'settlement_probes' as probe,
  (select count(*)::int from public.monthly_invoices mi
   where lower(coalesce(mi.status,'')) = 'paid'
     and not exists (
       select 1 from public.payment_transactions pt
       where pt.entity_type = 'monthly_invoice' and pt.entity_id = mi.id
     )) as paid_without_ledger,
  (select count(*)::int from public.bookings b
   join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
   where lower(coalesce(mi.status,'')) = 'paid'
     and lower(coalesce(b.payment_status,'')) = 'pending_monthly'
     and lower(coalesce(b.status,'')) <> 'cancelled') as paid_invoice_pending_monthly,
  (select count(*)::int from public.bookings b
   join public.monthly_invoices mi on mi.id = b.monthly_invoice_id
   where lower(coalesce(b.payout_status,'')) = 'eligible'
     and lower(coalesce(b.status,'')) <> 'cancelled'
     and (
       lower(coalesce(mi.status,'')) <> 'paid'
       or lower(coalesce(b.payment_status,'')) <> 'success'
     )) as eligible_without_full_settlement;
