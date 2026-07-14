-- Sales document invoice refunds (admin-initiated; Paystack or manual record).

alter table public.sales_documents
  drop constraint if exists sales_documents_status_check;

alter table public.sales_documents
  add constraint sales_documents_status_check
  check (status in ('requested', 'draft', 'sent', 'accepted', 'paid', 'refunded', 'void', 'expired'));

alter table public.sales_documents
  add column if not exists refunded_at timestamptz;

alter table public.sales_documents
  add column if not exists refund_reference text;

comment on column public.sales_documents.refunded_at is
  'When this invoice payment was refunded (Paystack or recorded manually in Office).';

comment on column public.sales_documents.refund_reference is
  'Paystack refund transaction reference when refund was processed online.';

create index if not exists sales_documents_refunded_at_idx
  on public.sales_documents (refunded_at desc)
  where refunded_at is not null;
