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


create or replace function public.enforce_sales_quote_acceptance_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.document_type = 'quote'
     and old.status is distinct from 'accepted'
     and new.status = 'accepted'
     and not exists (
       select 1
       from public.sales_quote_acceptance_snapshots s
       where s.quote_id = new.id
     ) then
    raise exception 'accepted quote requires immutable acceptance snapshot';
  end if;

  if old.document_type = 'quote' and old.status = 'accepted' then
    if new.customer_id is distinct from old.customer_id
       or new.customer_name is distinct from old.customer_name
       or new.customer_email is distinct from old.customer_email
       or new.customer_phone is distinct from old.customer_phone
       or new.line_items is distinct from old.line_items
       or new.subtotal_cents is distinct from old.subtotal_cents
       or new.total_cents is distinct from old.total_cents
       or new.currency is distinct from old.currency
       or new.due_date is distinct from old.due_date
       or new.notes is distinct from old.notes
       or new.source is distinct from old.source
       or new.request_details is distinct from old.request_details then
      raise exception 'accepted quote terms are immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sales_documents_quote_acceptance_integrity
  on public.sales_documents;

create trigger trg_sales_documents_quote_acceptance_integrity
before update on public.sales_documents
for each row execute function public.enforce_sales_quote_acceptance_integrity();

comment on function public.enforce_sales_quote_acceptance_integrity() is
  'QUOTE-E2E-02: requires an immutable snapshot before acceptance and freezes accepted quote terms.';
