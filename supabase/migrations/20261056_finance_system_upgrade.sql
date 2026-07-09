-- Finance system upgrade: recurring expenses, multi-level approval, budgets,
-- cash flow accounts, business health scores, notifications, accounting sync prep.

-- ---------------------------------------------------------------------------
-- Extend expense accounts (cash positions)
-- ---------------------------------------------------------------------------
alter table public.expense_accounts
  add column if not exists account_type text not null default 'bank'
    check (account_type in ('bank', 'petty_cash', 'card', 'paystack', 'other'));

alter table public.expense_accounts
  add column if not exists balance_cents integer not null default 0 check (balance_cents >= 0);

alter table public.expense_accounts
  add column if not exists external_accounting_id text;

alter table public.expense_accounts
  add column if not exists sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed'));

alter table public.expense_accounts
  add column if not exists last_synced_at timestamptz;

alter table public.expense_accounts
  add column if not exists updated_at timestamptz not null default now();

comment on column public.expense_accounts.balance_cents is 'Current balance in cents (manually updated or reconciled).';
comment on column public.expense_accounts.account_type is 'bank | petty_cash | card | paystack | other';

update public.expense_accounts set account_type = 'petty_cash' where lower(name) like '%petty cash%';
update public.expense_accounts set account_type = 'paystack' where lower(name) like '%paystack%';
update public.expense_accounts set account_type = 'card' where lower(name) like '%credit card%';

-- ---------------------------------------------------------------------------
-- Extend expenses: multi-level approval + recurring link
-- ---------------------------------------------------------------------------
alter table public.expenses
  add column if not exists approval_stage text not null default 'finance'
    check (approval_stage in ('finance', 'manager', 'owner', 'complete', 'rejected'));

alter table public.expenses
  add column if not exists recurring_expense_id uuid;

alter table public.expenses
  add column if not exists processing_fees_cents integer not null default 0 check (processing_fees_cents >= 0);

alter table public.expenses
  add column if not exists platform_fees_cents integer not null default 0 check (platform_fees_cents >= 0);

update public.expenses set approval_stage = 'complete' where status = 'approved';
update public.expenses set approval_stage = 'rejected' where status = 'rejected';

create index if not exists expenses_approval_stage_idx on public.expenses (approval_stage)
  where status = 'pending';

create index if not exists expenses_recurring_idx on public.expenses (recurring_expense_id)
  where recurring_expense_id is not null;

-- ---------------------------------------------------------------------------
-- Finance role flags
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists finance_manager_access boolean not null default false;

alter table public.user_profiles
  add column if not exists finance_owner_access boolean not null default false;

comment on column public.user_profiles.finance_manager_access is
  'Can approve expenses at manager stage (large amounts).';
comment on column public.user_profiles.finance_owner_access is
  'Can approve expenses at owner stage (very large amounts).';

-- ---------------------------------------------------------------------------
-- Approval limits (amount thresholds in cents)
-- ---------------------------------------------------------------------------
create table if not exists public.expense_approval_limits (
  id uuid primary key default gen_random_uuid(),
  stage text not null unique check (stage in ('finance', 'manager', 'owner')),
  min_amount_cents integer not null default 0 check (min_amount_cents >= 0),
  max_amount_cents integer,
  label text not null,
  created_at timestamptz not null default now()
);

insert into public.expense_approval_limits (stage, min_amount_cents, max_amount_cents, label) values
  ('finance', 0, null, 'Finance Officer'),
  ('manager', 500000, null, 'Manager'),
  ('owner', 5000000, null, 'Owner')
on conflict (stage) do nothing;

comment on table public.expense_approval_limits is
  'Expense amount thresholds for multi-level approval. Manager required >= R5,000; Owner >= R50,000.';

-- ---------------------------------------------------------------------------
-- Approval history
-- ---------------------------------------------------------------------------
create table if not exists public.expense_approval_events (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  stage text not null check (stage in ('finance', 'manager', 'owner')),
  action text not null check (action in ('approved', 'rejected', 'submitted')),
  actor_id uuid references auth.users (id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists expense_approval_events_expense_idx
  on public.expense_approval_events (expense_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Recurring expenses
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category_id uuid not null references public.expense_categories (id) on delete restrict,
  vendor_id uuid references public.expense_vendors (id) on delete set null,
  branch_id uuid not null references public.cities (id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  payment_method text not null check (payment_method in (
    'cash', 'card', 'bank_transfer', 'paystack', 'eft', 'other'
  )),
  paid_from_account_id uuid references public.expense_accounts (id) on delete set null,
  frequency text not null check (frequency in (
    'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
  )),
  next_run_date date not null,
  last_generated_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  auto_approve boolean not null default true,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  external_accounting_id text,
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_expenses_next_run_idx
  on public.recurring_expenses (next_run_date)
  where status = 'active';

alter table public.expenses
  add constraint expenses_recurring_expense_fk
  foreign key (recurring_expense_id) references public.recurring_expenses (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------------
create table if not exists public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  period_type text not null check (period_type in ('month', 'year')),
  period_start date not null,
  period_end date not null,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  external_accounting_id text,
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_budgets_period_check check (period_end >= period_start)
);

create table if not exists public.finance_budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.finance_budgets (id) on delete cascade,
  category_id uuid references public.expense_categories (id) on delete set null,
  branch_id uuid references public.cities (id) on delete set null,
  vendor_id uuid references public.expense_vendors (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  notes text,
  created_at timestamptz not null default now(),
  constraint finance_budget_lines_target_check check (
    category_id is not null or branch_id is not null or vendor_id is not null
  )
);

create index if not exists finance_budget_lines_budget_idx on public.finance_budget_lines (budget_id);
create index if not exists finance_budgets_period_idx on public.finance_budgets (period_start, period_end)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- Business health scores (daily snapshots)
-- ---------------------------------------------------------------------------
create table if not exists public.business_health_scores (
  id uuid primary key default gen_random_uuid(),
  score_date date not null unique,
  overall_score integer not null check (overall_score >= 0 and overall_score <= 100),
  status_label text not null,
  metrics jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  weights jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists business_health_scores_date_idx
  on public.business_health_scores (score_date desc);

-- ---------------------------------------------------------------------------
-- Finance in-app notifications
-- ---------------------------------------------------------------------------
create table if not exists public.finance_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  link text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists finance_notifications_user_unread_idx
  on public.finance_notifications (user_id, created_at desc)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- Accounting sync queue (future Zoho Books integration)
-- ---------------------------------------------------------------------------
create table if not exists public.accounting_sync_records (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in (
    'expense', 'recurring_expense', 'budget', 'expense_account', 'booking', 'invoice'
  )),
  entity_id uuid not null,
  external_accounting_id text,
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed')),
  last_synced_at timestamptz,
  sync_errors text,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

create index if not exists accounting_sync_records_status_idx
  on public.accounting_sync_records (sync_status)
  where sync_status in ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- Balance sheet architecture prep (no journal entries yet)
-- ---------------------------------------------------------------------------
create table if not exists public.finance_chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_class text not null check (account_class in (
    'asset', 'liability', 'equity', 'revenue', 'expense'
  )),
  parent_id uuid references public.finance_chart_of_accounts (id) on delete set null,
  is_active boolean not null default true,
  external_accounting_id text,
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.finance_chart_of_accounts is
  'Chart of accounts scaffold for future double-entry / Zoho Books sync. No journal entries yet.';

-- ---------------------------------------------------------------------------
-- RLS: deny authenticated (API uses service role)
-- ---------------------------------------------------------------------------
alter table public.expense_approval_limits enable row level security;
alter table public.expense_approval_events enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.finance_budgets enable row level security;
alter table public.finance_budget_lines enable row level security;
alter table public.business_health_scores enable row level security;
alter table public.finance_notifications enable row level security;
alter table public.accounting_sync_records enable row level security;
alter table public.finance_chart_of_accounts enable row level security;

create policy expense_approval_limits_deny on public.expense_approval_limits for all to authenticated using (false);
create policy expense_approval_events_deny on public.expense_approval_events for all to authenticated using (false);
create policy recurring_expenses_deny on public.recurring_expenses for all to authenticated using (false);
create policy finance_budgets_deny on public.finance_budgets for all to authenticated using (false);
create policy finance_budget_lines_deny on public.finance_budget_lines for all to authenticated using (false);
create policy business_health_scores_deny on public.business_health_scores for all to authenticated using (false);
create policy finance_notifications_deny on public.finance_notifications for all to authenticated using (false);
create policy accounting_sync_records_deny on public.accounting_sync_records for all to authenticated using (false);
create policy finance_chart_of_accounts_deny on public.finance_chart_of_accounts for all to authenticated using (false);
