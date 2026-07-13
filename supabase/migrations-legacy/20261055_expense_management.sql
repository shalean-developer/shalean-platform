-- Expense management: categories, vendors, expenses, receipt storage.
-- Branches map to cities (multi-city operations).

-- ---------------------------------------------------------------------------
-- Expense categories (grouped defaults + admin-created)
-- ---------------------------------------------------------------------------
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  name text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_name, name)
);

create index if not exists expense_categories_group_idx on public.expense_categories (group_name);
create index if not exists expense_categories_active_idx on public.expense_categories (is_active) where is_active = true;

comment on table public.expense_categories is 'Operating expense categories grouped by department (Staff, Transport, etc.).';

-- ---------------------------------------------------------------------------
-- Expense vendors
-- ---------------------------------------------------------------------------
create table if not exists public.expense_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expense_vendors_name_idx on public.expense_vendors (lower(name));

comment on table public.expense_vendors is 'Vendors/suppliers for operating expenses.';

-- ---------------------------------------------------------------------------
-- Paid-from accounts (bank, petty cash, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.expense_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.expense_accounts is 'Accounts expenses are paid from (business bank, petty cash, etc.).';

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category_id uuid not null references public.expense_categories (id) on delete restrict,
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  payment_method text not null check (payment_method in (
    'cash', 'card', 'bank_transfer', 'paystack', 'eft', 'other'
  )),
  paid_from_account_id uuid references public.expense_accounts (id) on delete set null,
  vendor_id uuid references public.expense_vendors (id) on delete set null,
  branch_id uuid not null references public.cities (id) on delete restrict,
  booking_id uuid references public.bookings (id) on delete set null,
  receipt_path text,
  receipt_mime text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  -- Zoho Books sync (future)
  external_accounting_id text,
  sync_status text not null default 'not_synced' check (sync_status in (
    'not_synced', 'pending', 'synced', 'failed'
  )),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_rejection_reason_when_rejected check (
    status != 'rejected' or (rejection_reason is not null and length(trim(rejection_reason)) > 0)
  )
);

create index if not exists expenses_date_idx on public.expenses (expense_date desc);
create index if not exists expenses_status_idx on public.expenses (status);
create index if not exists expenses_category_idx on public.expenses (category_id);
create index if not exists expenses_branch_idx on public.expenses (branch_id);
create index if not exists expenses_vendor_idx on public.expenses (vendor_id) where vendor_id is not null;
create index if not exists expenses_booking_idx on public.expenses (booking_id) where booking_id is not null;
create index if not exists expenses_approved_date_idx on public.expenses (expense_date)
  where status = 'approved';

comment on table public.expenses is 'Operating expenses with approval workflow; only approved rows affect profit.';
comment on column public.expenses.branch_id is 'Branch = city (multi-city operations).';
comment on column public.expenses.external_accounting_id is 'Zoho Books expense ID when synced.';

-- ---------------------------------------------------------------------------
-- Finance access flag on user profiles
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists finance_access boolean not null default false;

comment on column public.user_profiles.finance_access is
  'When true, user can access expense management (in addition to admin email allowlist).';

-- ---------------------------------------------------------------------------
-- Seed default categories
-- ---------------------------------------------------------------------------
insert into public.expense_categories (group_name, name, is_system) values
  ('Staff', 'Office Salaries', true),
  ('Staff', 'Admin Salaries', true),
  ('Staff', 'Bonuses', true),
  ('Staff', 'Training', true),
  ('Transport', 'Fuel', true),
  ('Transport', 'Uber', true),
  ('Transport', 'Parking', true),
  ('Transport', 'Vehicle Maintenance', true),
  ('Marketing', 'Google Ads', true),
  ('Marketing', 'Facebook Ads', true),
  ('Marketing', 'Flyers', true),
  ('Marketing', 'Promotions', true),
  ('Operations', 'Cleaning Supplies', true),
  ('Operations', 'Equipment', true),
  ('Operations', 'Uniforms', true),
  ('Operations', 'Laundry', true),
  ('Office', 'Rent', true),
  ('Office', 'Internet', true),
  ('Office', 'Electricity', true),
  ('Office', 'Water', true),
  ('Office', 'Stationery', true),
  ('Technology', 'Website Hosting', true),
  ('Technology', 'Domain', true),
  ('Technology', 'SMS', true),
  ('Technology', 'WhatsApp API', true),
  ('Technology', 'Email', true),
  ('Technology', 'Zoho', true),
  ('Technology', 'OpenAI API', true),
  ('Technology', 'Paystack Fees', true),
  ('Financial', 'Bank Charges', true),
  ('Financial', 'Insurance', true),
  ('Financial', 'Accounting Fees', true),
  ('Financial', 'Taxes', true)
on conflict (group_name, name) do nothing;

-- ---------------------------------------------------------------------------
-- Seed default paid-from accounts
-- ---------------------------------------------------------------------------
insert into public.expense_accounts (name) values
  ('Business Bank Account'),
  ('Petty Cash'),
  ('Company Credit Card'),
  ('Paystack Balance')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Receipt storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- RLS: admin/service role only (API uses service role)
-- ---------------------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.expense_vendors enable row level security;
alter table public.expense_accounts enable row level security;
alter table public.expenses enable row level security;

create policy expense_categories_admin on public.expense_categories
  for all to authenticated using (false);

create policy expense_vendors_admin on public.expense_vendors
  for all to authenticated using (false);

create policy expense_accounts_admin on public.expense_accounts
  for all to authenticated using (false);

create policy expenses_admin on public.expenses
  for all to authenticated using (false);
