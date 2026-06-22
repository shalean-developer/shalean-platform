-- Admin override for draft monthly invoice due dates (e.g. customer pays on the 20th).

alter table public.monthly_invoices
  add column if not exists due_date_override date;

comment on column public.monthly_invoices.due_date_override is
  'When set on a draft invoice, replaces auto due_date from last visit in the billing month.';

create or replace function public.recompute_monthly_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_customer uuid;
  v_month text;
  v_cnt integer;
  v_sum bigint;
  v_adj bigint;
  v_total bigint;
  v_due date;
  v_override date;
begin
  select status, customer_id, month, due_date_override
  into v_status, v_customer, v_month, v_override
  from public.monthly_invoices
  where id = p_invoice_id;

  if v_status is null or v_status is distinct from 'draft' then
    return;
  end if;

  select
    count(*)::int,
    coalesce(sum(public.booking_line_amount_cents(b.total_paid_zar, b.amount_paid_cents)), 0)::bigint
  into v_cnt, v_sum
  from public.bookings b
  where b.monthly_invoice_id = p_invoice_id
    and coalesce(b.status, '') is distinct from 'cancelled';

  select coalesce(sum(ia.amount_cents), 0)::bigint
  into v_adj
  from public.invoice_adjustments ia
  where ia.customer_id = v_customer
    and ia.month_applied = v_month
    and (ia.applied_to_invoice_id is null or ia.applied_to_invoice_id = p_invoice_id);

  v_total := greatest(0::bigint, v_sum + v_adj);
  v_due := coalesce(v_override, public.draft_monthly_invoice_due_date(p_invoice_id, v_month));

  update public.monthly_invoices
  set
    total_bookings = v_cnt,
    total_amount_cents = v_total,
    due_date = v_due,
    updated_at = now()
  where id = p_invoice_id and status = 'draft';
end;
$$;
