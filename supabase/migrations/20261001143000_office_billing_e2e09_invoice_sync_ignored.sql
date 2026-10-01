-- OFFICE-BILLING-E2E-09
-- Allow invoice sync metadata to represent intentionally ignored historical
-- documents whose external Zoho invoice no longer exists.
--
-- This is additive only. Existing statuses remain valid.
alter table public.accounting_invoice_sync
  drop constraint if exists accounting_invoice_sync_sync_status_check;

alter table public.accounting_invoice_sync
  add constraint accounting_invoice_sync_sync_status_check
  check (sync_status in ('not_synced', 'pending', 'synced', 'failed', 'ignored'));
