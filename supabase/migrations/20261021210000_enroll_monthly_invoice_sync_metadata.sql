-- Stage 03: recover linked monthly invoices missing sync metadata.
-- Insert only. Do not alter existing metadata, balances, bookings or payouts.
insert into public.accounting_invoice_sync
  (entity_type, entity_id, zoho_invoice_id, sync_status)
select 'monthly_invoice', mi.id, mi.zoho_invoice_id, 'pending'
from public.monthly_invoices mi
where nullif(btrim(mi.zoho_invoice_id), '') is not null
on conflict (entity_type, entity_id) do nothing;
