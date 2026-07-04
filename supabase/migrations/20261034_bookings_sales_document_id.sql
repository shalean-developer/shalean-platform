-- Link bookings created from accepted sales-document quotes/invoices.

alter table public.bookings
  add column if not exists sales_document_id uuid references public.sales_documents (id) on delete set null;

create unique index if not exists bookings_sales_document_id_unique_idx
  on public.bookings (sales_document_id)
  where sales_document_id is not null;

comment on column public.bookings.sales_document_id is
  'When set, this booking was created from an accepted sales document invoice (quote → invoice flow).';

create index if not exists bookings_sales_document_id_lookup_idx
  on public.bookings (sales_document_id)
  where sales_document_id is not null;
