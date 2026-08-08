-- P3 closeout: the application queues unified refund accounting through accounting_sync_records.
-- Keep the database entity-type guard aligned with AccountingSyncEntityType.

alter table public.accounting_sync_records
  drop constraint if exists accounting_sync_records_entity_type_check;

alter table public.accounting_sync_records
  add constraint accounting_sync_records_entity_type_check
  check (entity_type = any (array[
    'expense'::text,
    'recurring_expense'::text,
    'budget'::text,
    'expense_account'::text,
    'booking'::text,
    'invoice'::text,
    'vendor'::text,
    'payment_transaction'::text,
    'refund'::text
  ]));
