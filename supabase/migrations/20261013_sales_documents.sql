-- Ad-hoc sales quotes and invoices (admin-created, Zoho-synced server-side).

create table if not exists public.sales_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('quote', 'invoice')),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'paid', 'void', 'expired')),
  customer_id uuid references auth.users (id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  currency text not null default 'ZAR',
  due_date date,
  notes text,
  sent_at timestamptz,
  converted_from_id uuid references public.sales_documents (id) on delete set null,
  public_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  paystack_reference text unique,
  payment_link text,
  payment_link_expires_at timestamptz,
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  zoho_estimate_id text,
  zoho_invoice_id text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_documents_customer_id_idx
  on public.sales_documents (customer_id)
  where customer_id is not null;

create index if not exists sales_documents_status_idx
  on public.sales_documents (status);

create index if not exists sales_documents_document_type_idx
  on public.sales_documents (document_type);

create index if not exists sales_documents_public_token_idx
  on public.sales_documents (public_token);

create index if not exists sales_documents_zoho_invoice_id_idx
  on public.sales_documents (zoho_invoice_id)
  where zoho_invoice_id is not null;

create index if not exists sales_documents_zoho_estimate_id_idx
  on public.sales_documents (zoho_estimate_id)
  where zoho_estimate_id is not null;

comment on table public.sales_documents is
  'Admin-created ad-hoc quotes and invoices; guest access via public_token on server routes.';

drop trigger if exists trg_sales_documents_updated_at on public.sales_documents;
create or replace function public.sales_documents_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger trg_sales_documents_updated_at
  before update on public.sales_documents
  for each row execute function public.sales_documents_touch_updated_at();

alter table public.sales_documents enable row level security;

drop policy if exists sales_documents_select_own on public.sales_documents;
create policy sales_documents_select_own
  on public.sales_documents for select to authenticated
  using (
    customer_id = auth.uid()
    or lower(customer_email) = lower(coalesce(
      (select email from auth.users where id = auth.uid()),
      ''
    ))
  );

drop policy if exists sales_documents_admin_all on public.sales_documents;
create policy sales_documents_admin_all
  on public.sales_documents for all to authenticated
  using (public.blog_is_admin())
  with check (public.blog_is_admin());

grant select on public.sales_documents to authenticated;
grant all on public.sales_documents to service_role;

create table if not exists public.sales_document_paystack_charge_dedup (
  charge_reference text primary key,
  document_id uuid not null references public.sales_documents (id) on delete cascade,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

grant all on public.sales_document_paystack_charge_dedup to service_role;
