-- Public /quote form → sales_documents quote requests for Office review.

alter table public.sales_documents
  drop constraint if exists sales_documents_status_check;

alter table public.sales_documents
  add constraint sales_documents_status_check
  check (status in ('requested', 'draft', 'sent', 'accepted', 'paid', 'void', 'expired'));

alter table public.sales_documents
  add column if not exists source text not null default 'admin';

alter table public.sales_documents
  drop constraint if exists sales_documents_source_check;

alter table public.sales_documents
  add constraint sales_documents_source_check
  check (source in ('admin', 'customer_request'));

alter table public.sales_documents
  add column if not exists request_details jsonb;

create index if not exists sales_documents_quote_requests_idx
  on public.sales_documents (created_at desc)
  where status = 'requested' and document_type = 'quote';

comment on column public.sales_documents.source is
  'admin = created in Office; customer_request = submitted via public /quote form.';

comment on column public.sales_documents.request_details is
  'Structured payload from public quote request form (service, rooms, suburb, etc.).';
