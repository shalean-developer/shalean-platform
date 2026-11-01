-- Read-only Zoho projection. Never inserted into the local approval/expense ledger.
create table public.zoho_expense_period_mirror (
  organization_id text not null,
  date_from date not null,
  date_to date not null,
  records jsonb not null default '[]'::jsonb check (jsonb_typeof(records) = 'array'),
  last_success_at timestamptz,
  last_attempt_at timestamptz not null default now(),
  last_error text,
  primary key (organization_id, date_from, date_to),
  check (date_to >= date_from and date_to - date_from <= 366)
);
alter table public.zoho_expense_period_mirror enable row level security;
revoke all on public.zoho_expense_period_mirror from public, anon, authenticated;
grant select, insert, update on public.zoho_expense_period_mirror to service_role;
comment on table public.zoho_expense_period_mirror is
  'Complete date-window snapshots of Zoho expenses; includes separately classified non-operating records. No accounting writes or local approval effects.';
