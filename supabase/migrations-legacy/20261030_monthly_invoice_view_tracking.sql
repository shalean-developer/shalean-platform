-- Track when customers open monthly invoice pay links from email.

alter table public.monthly_invoices
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists view_count int not null default 0;

alter table public.monthly_invoices
  drop constraint if exists monthly_invoices_view_count_nonneg;

alter table public.monthly_invoices
  add constraint monthly_invoices_view_count_nonneg check (view_count >= 0);

create or replace function public.record_monthly_invoice_view(invoice_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.monthly_invoices
  set
    view_count = view_count + 1,
    last_viewed_at = now(),
    first_viewed_at = coalesce(first_viewed_at, now())
  where id = invoice_id;
$$;

revoke all on function public.record_monthly_invoice_view(uuid) from public;
grant execute on function public.record_monthly_invoice_view(uuid) to service_role;
