-- Optional link from an invoice adjustment to a specific booking line on that invoice.

alter table public.invoice_adjustments
  add column if not exists booking_id uuid references public.bookings (id) on delete set null;

create index if not exists invoice_adjustments_booking_id_idx
  on public.invoice_adjustments (booking_id)
  where booking_id is not null;

comment on column public.invoice_adjustments.booking_id is
  'Optional booking on the monthly invoice this adjustment relates to.';

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
        'booking_id', new.booking_id,
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
