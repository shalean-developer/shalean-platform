-- QUOTE-E2E-02 — immutable accepted-quote truth.
--
-- Captures exactly what the customer accepted before the mutable quote row is
-- transitioned to status=accepted. One immutable acceptance record per quote.

create table if not exists public.sales_quote_acceptance_snapshots (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_documents(id) on delete restrict,
  invoice_id uuid not null references public.sales_documents(id) on delete restrict,
  snapshot_schema_version integer not null default 1 check (snapshot_schema_version = 1),
  source_quote_updated_at timestamptz not null,
  quote_status_before text not null,
  customer_id uuid,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  line_items jsonb not null,
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  currency text not null,
  due_date date,
  notes text,
  source text,
  request_details jsonb,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sales_quote_acceptance_snapshots_quote_unique unique (quote_id),
  constraint sales_quote_acceptance_snapshots_invoice_unique unique (invoice_id)
);

create index if not exists sales_quote_acceptance_snapshots_accepted_at_idx
  on public.sales_quote_acceptance_snapshots (accepted_at desc);

alter table public.sales_quote_acceptance_snapshots enable row level security;

revoke all on table public.sales_quote_acceptance_snapshots from anon, authenticated;
grant all on table public.sales_quote_acceptance_snapshots to service_role;

create or replace function public.prevent_sales_quote_acceptance_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'sales_quote_acceptance_snapshots are immutable';
end;
$$;

drop trigger if exists trg_sales_quote_acceptance_snapshots_immutable
  on public.sales_quote_acceptance_snapshots;

create trigger trg_sales_quote_acceptance_snapshots_immutable
before update or delete on public.sales_quote_acceptance_snapshots
for each row execute function public.prevent_sales_quote_acceptance_snapshot_mutation();

comment on table public.sales_quote_acceptance_snapshots is
  'QUOTE-E2E-02: immutable record of the exact quote terms accepted by a customer before quote status transitions to accepted.';
