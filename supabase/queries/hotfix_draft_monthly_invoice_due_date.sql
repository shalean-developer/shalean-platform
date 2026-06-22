-- Hotfix: functions required by recompute_monthly_invoice_totals (20261027 override path).

create or replace function public.monthly_invoice_due_date(p_month text)
returns date
language sql
immutable
as $$
  select (date_trunc('month', (p_month || '-01')::date) + interval '1 month' - interval '1 day')::date;
$$;

comment on function public.monthly_invoice_due_date(text) is
  'Provisional due_date for draft monthly_invoices.month (YYYY-MM): last day of billing month; replaced at finalize.';

create or replace function public.draft_monthly_invoice_due_date(
  p_invoice_id uuid,
  p_month text
)
returns date
language sql
stable
as $$
  select coalesce(
    (
      select max(b.date::date)
      from public.bookings b
      where b.monthly_invoice_id = p_invoice_id
        and coalesce(b.status, '') is distinct from 'cancelled'
        and b.date::date >= (p_month || '-01')::date
        and b.date::date <= (
          date_trunc('month', (p_month || '-01')::date) + interval '1 month' - interval '1 day'
        )::date
    ),
    public.monthly_invoice_due_date(p_month)
  );
$$;

comment on function public.draft_monthly_invoice_due_date(uuid, text) is
  'Provisional due_date for a draft monthly invoice: last visit in billing month, else last calendar day of month.';
