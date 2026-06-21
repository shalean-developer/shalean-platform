-- Draft monthly invoices: due_date = last scheduled visit in the billing month
-- (replaced with today when finalize cron collects payment).

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
        and b.date >= (p_month || '-01')::date
        and b.date <= (
          date_trunc('month', (p_month || '-01')::date) + interval '1 month' - interval '1 day'
        )::date
    ),
    public.monthly_invoice_due_date(p_month)
  );
$$;

comment on function public.draft_monthly_invoice_due_date(uuid, text) is
  'Provisional due_date for a draft monthly invoice: last visit in billing month, else last calendar day of month.';

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
begin
  select status, customer_id, month
  into v_status, v_customer, v_month
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
  v_due := public.draft_monthly_invoice_due_date(p_invoice_id, v_month);

  update public.monthly_invoices
  set
    total_bookings = v_cnt,
    total_amount_cents = v_total,
    due_date = v_due,
    updated_at = now()
  where id = p_invoice_id and status = 'draft';
end;
$$;

-- Backfill open drafts (e.g. legacy 14th-of-next-month due dates).
update public.monthly_invoices mi
set
  due_date = public.draft_monthly_invoice_due_date(mi.id, mi.month),
  updated_at = now()
where mi.status = 'draft'
  and mi.due_date is distinct from public.draft_monthly_invoice_due_date(mi.id, mi.month);
