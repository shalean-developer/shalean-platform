-- Stage 03: enroll existing linked booking Zoho invoices as metadata only.
-- Enrollment neither confirms nor records a payment or payout.
insert into public.accounting_invoice_sync
  (entity_type, entity_id, booking_id, zoho_invoice_id, sync_status)
select 'booking', b.id, b.id, b.zoho_invoice_id, 'pending'
from public.bookings b
where nullif(btrim(b.zoho_invoice_id), '') is not null
on conflict (entity_type, entity_id) do nothing;
