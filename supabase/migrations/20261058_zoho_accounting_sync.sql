-- Zoho Books accounting sync: invoice snapshots, vendor sync, settings, queue extensions.

-- ---------------------------------------------------------------------------
-- Vendor Zoho sync columns
-- ---------------------------------------------------------------------------
alter table public.expense_vendors
  add column if not exists external_accounting_id text,
  add column if not exists sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed')),
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_errors text;

create index if not exists expense_vendors_sync_status_idx
  on public.expense_vendors (sync_status)
  where sync_status in ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- Unified invoice accounting sync metadata
-- ---------------------------------------------------------------------------
create table if not exists public.accounting_invoice_sync (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('booking', 'monthly_invoice', 'sales_document')),
  entity_id uuid not null,
  zoho_invoice_id text,
  zoho_invoice_number text,
  zoho_customer_id text,
  booking_id uuid references public.bookings (id) on delete set null,
  invoice_status text,
  invoice_total_cents integer,
  tax_amount_cents integer,
  outstanding_balance_cents integer,
  currency_code text not null default 'ZAR',
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed')),
  sync_errors text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

create index if not exists accounting_invoice_sync_zoho_idx
  on public.accounting_invoice_sync (zoho_invoice_id)
  where zoho_invoice_id is not null;

create index if not exists accounting_invoice_sync_status_idx
  on public.accounting_invoice_sync (sync_status)
  where sync_status in ('pending', 'failed');

comment on table public.accounting_invoice_sync is
  'Zoho Books invoice sync metadata for bookings, monthly invoices, and sales documents.';

-- ---------------------------------------------------------------------------
-- Zoho integration settings (singleton)
-- ---------------------------------------------------------------------------
create table if not exists public.zoho_integration_settings (
  id uuid primary key default gen_random_uuid(),
  singleton_key text not null unique default 'default',
  expense_category_mappings jsonb not null default '[]'::jsonb,
  default_paystack_vendor_id uuid references public.expense_vendors (id) on delete set null,
  default_paystack_category_id uuid references public.expense_categories (id) on delete set null,
  sync_frequency_minutes integer not null default 15 check (sync_frequency_minutes between 5 and 1440),
  max_retry_attempts integer not null default 5 check (max_retry_attempts between 1 and 20),
  retry_base_delay_seconds integer not null default 60 check (retry_base_delay_seconds between 10 and 3600),
  auto_sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.zoho_integration_settings is
  'Admin-configurable Zoho Books integration settings. OAuth credentials remain in env vars.';

insert into public.zoho_integration_settings (singleton_key)
values ('default')
on conflict (singleton_key) do nothing;

-- ---------------------------------------------------------------------------
-- Extend accounting sync queue entity types + retry tracking
-- ---------------------------------------------------------------------------
alter table public.accounting_sync_records
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_retry_at timestamptz;

-- Drop and recreate entity_type check to add vendor + payment_transaction
alter table public.accounting_sync_records
  drop constraint if exists accounting_sync_records_entity_type_check;

alter table public.accounting_sync_records
  add constraint accounting_sync_records_entity_type_check
  check (entity_type in (
    'expense', 'recurring_expense', 'budget', 'expense_account',
    'booking', 'invoice', 'vendor', 'payment_transaction'
  ));

create index if not exists accounting_sync_records_next_retry_idx
  on public.accounting_sync_records (next_retry_at)
  where sync_status = 'failed' and next_retry_at is not null;

-- ---------------------------------------------------------------------------
-- Payment transaction sync error tracking
-- ---------------------------------------------------------------------------
alter table public.payment_transactions
  add column if not exists sync_errors text;

alter table public.expenses
  add column if not exists sync_errors text;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.accounting_invoice_sync enable row level security;
alter table public.zoho_integration_settings enable row level security;

create policy accounting_invoice_sync_deny on public.accounting_invoice_sync
  for all to authenticated using (false);

create policy zoho_integration_settings_deny on public.zoho_integration_settings
  for all to authenticated using (false);
