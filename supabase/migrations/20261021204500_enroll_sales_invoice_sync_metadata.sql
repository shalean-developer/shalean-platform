-- Stage 03: enroll historical linked sales invoices for metadata-only Zoho refresh.
-- Never modify an existing sync row or any customer payment / invoice balance.
insert into public.accounting_invoice_sync
  (entity_type, entity_id, zoho_invoice_id, zoho_invoice_number, sync_status)
select 'sales_document', sd.id, sd.zoho_invoice_id, sd.zoho_invoice_number, 'pending'
from public.sales_documents sd
where sd.document_type = 'invoice'
  and nullif(btrim(sd.zoho_invoice_id), '') is not null
on conflict (entity_type, entity_id) do nothing;
