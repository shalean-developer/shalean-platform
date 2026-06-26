-- Monthly invoice refunds (admin-initiated; Paystack or manual record).

alter table public.monthly_invoices
  drop constraint if exists monthly_invoices_status_check;

alter table public.monthly_invoices
  add constraint monthly_invoices_status_check
  check (status in ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'refunded'));

alter table public.monthly_invoices
  add column if not exists refunded_at timestamptz;

alter table public.monthly_invoices
  add column if not exists refund_reference text;

comment on column public.monthly_invoices.refunded_at is
  'When this monthly invoice payment was refunded (Paystack or recorded manually in Office).';

comment on column public.monthly_invoices.refund_reference is
  'Paystack refund transaction reference when refund was processed online.';

create index if not exists monthly_invoices_refunded_at_idx
  on public.monthly_invoices (refunded_at desc)
  where refunded_at is not null;
