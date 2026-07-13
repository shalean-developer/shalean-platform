-- Draft invoice adjustments: stamp applied_to_invoice_id and recompute totals on insert.
-- Also count applied draft lines in recompute (not only unapplied pending rows).

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

  update public.monthly_invoices
  set
    total_bookings = v_cnt,
    total_amount_cents = v_total,
    updated_at = now()
  where id = p_invoice_id and status = 'draft';
end;
$$;

create or replace function public.invoice_adjustments_after_insert_route()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv_id uuid;
  inv_status text;
  inv_closed boolean;
  v_paid bigint;
  v_total bigint;
  v_bal bigint;
begin
  select id, status, is_closed
  into inv_id, inv_status, inv_closed
  from public.monthly_invoices
  where customer_id = new.customer_id
    and month = new.month_applied
  limit 1;

  if inv_id is null then
    return new;
  end if;

  if coalesce(inv_closed, false) = true then
    raise exception 'invoice_adjustments_month_closed'
      using hint = 'This billing month is closed; use a future month_applied.';
  end if;

  if inv_status = 'draft' then
    update public.invoice_adjustments
    set
      applied_to_invoice_id = inv_id,
      applied_at = now()
    where id = new.id;

    perform public.recompute_monthly_invoice_totals(inv_id);
    return new;
  end if;

  if inv_status in ('sent', 'partially_paid', 'overdue') then
    update public.monthly_invoices
    set
      total_amount_cents = greatest(0, total_amount_cents + new.amount_cents),
      updated_at = now()
    where id = inv_id;

    update public.invoice_adjustments
    set
      applied_to_invoice_id = inv_id,
      applied_at = now()
    where id = new.id;

    select
      coalesce(amount_paid_cents, 0)::bigint,
      coalesce(total_amount_cents, 0)::bigint
    into v_paid, v_total
    from public.monthly_invoices
    where id = inv_id;

    v_bal := greatest(0::bigint, v_total - v_paid);

    perform public.monthly_invoice_append_snapshot_event(
      inv_id,
      jsonb_build_object(
        'kind', 'adjustment_applied',
        'at', now(),
        'adjustment_id', new.id,
        'amount_cents', new.amount_cents,
        'reason', new.reason,
        'category', new.category,
        'amount_paid_cents_after', v_paid,
        'balance_cents_after', v_bal,
        'actor', 'system',
        'reference', 'adjustment:' || new.id::text
      )
    );
  end if;

  return new;
end;
$$;

comment on function public.recompute_monthly_invoice_totals(uuid) is
  'Draft invoice totals: non-cancelled bookings + adjustments for the billing month (unapplied or applied to this invoice).';

-- Backfill: link orphan draft-month adjustments to their draft invoice row.
update public.invoice_adjustments ia
set
  applied_to_invoice_id = mi.id,
  applied_at = coalesce(ia.applied_at, ia.created_at, now())
from public.monthly_invoices mi
where ia.applied_to_invoice_id is null
  and mi.customer_id = ia.customer_id
  and mi.month = ia.month_applied
  and lower(trim(coalesce(mi.status, ''))) = 'draft';

-- Refresh draft totals after backfill.
do $$
declare
  inv_id uuid;
begin
  for inv_id in
    select id from public.monthly_invoices where lower(trim(coalesce(status, ''))) = 'draft'
  loop
    perform public.recompute_monthly_invoice_totals(inv_id);
  end loop;
end;
$$;
