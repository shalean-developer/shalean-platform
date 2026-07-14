-- Track when customers open quote/invoice links from email.

alter table public.sales_documents
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists view_count int not null default 0;

alter table public.sales_documents
  drop constraint if exists sales_documents_view_count_nonneg;

alter table public.sales_documents
  add constraint sales_documents_view_count_nonneg check (view_count >= 0);

create or replace function public.record_sales_document_view(doc_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.sales_documents
  set
    view_count = view_count + 1,
    last_viewed_at = now(),
    first_viewed_at = coalesce(first_viewed_at, now())
  where id = doc_id;
$$;

revoke all on function public.record_sales_document_view(uuid) from public;
grant execute on function public.record_sales_document_view(uuid) to service_role;
