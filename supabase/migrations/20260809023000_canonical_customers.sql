-- P4 Customer CRM: stable business identity independent of login/auth account.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  display_name text,
  primary_email text,
  normalized_email text,
  primary_phone text,
  normalized_phone text,
  status text not null default 'active' check (status in ('active','merged','archived')),
  merged_into_customer_id uuid references public.customers(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (merged_into_customer_id is null or merged_into_customer_id <> id)
);

create unique index if not exists customers_auth_user_unique_idx
  on public.customers(auth_user_id) where auth_user_id is not null and status = 'active';
create index if not exists customers_normalized_email_idx on public.customers(normalized_email);
create index if not exists customers_normalized_phone_idx on public.customers(normalized_phone);

create table if not exists public.customer_identity_aliases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  identity_type text not null check (identity_type in ('email','phone')),
  normalized_value text not null,
  raw_value text,
  source text not null default 'unknown',
  verified boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(customer_id, identity_type, normalized_value)
);
create index if not exists customer_identity_alias_lookup_idx
  on public.customer_identity_aliases(identity_type, normalized_value);

alter table public.bookings add column if not exists crm_customer_id uuid references public.customers(id) on delete set null;
alter table public.monthly_invoices add column if not exists crm_customer_id uuid references public.customers(id) on delete set null;
alter table public.sales_documents add column if not exists crm_customer_id uuid references public.customers(id) on delete set null;
alter table public.customer_care_cases add column if not exists crm_customer_id uuid references public.customers(id) on delete set null;

create index if not exists bookings_crm_customer_idx on public.bookings(crm_customer_id, created_at desc);
create index if not exists monthly_invoices_crm_customer_idx on public.monthly_invoices(crm_customer_id);
create index if not exists sales_documents_crm_customer_idx on public.sales_documents(crm_customer_id);
create index if not exists customer_care_cases_crm_customer_idx on public.customer_care_cases(crm_customer_id, created_at desc);

alter table public.customers enable row level security;
alter table public.customer_identity_aliases enable row level security;
revoke all on public.customers from anon, authenticated;
revoke all on public.customer_identity_aliases from anon, authenticated;
grant all on public.customers to service_role;
grant all on public.customer_identity_aliases to service_role;

comment on table public.customers is 'Canonical Shalean customer business identity. Stable across login-account changes and contact-detail changes.';
comment on table public.customer_identity_aliases is 'Historical normalized email/phone aliases used to resolve records to one canonical customer without treating auth.users as the CRM master.';
comment on column public.bookings.crm_customer_id is 'Canonical CRM customer identity. Legacy customer_id may still contain historical auth-user references during migration.';
