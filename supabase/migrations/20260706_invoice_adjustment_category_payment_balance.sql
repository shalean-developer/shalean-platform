-- Adjustment governance: category + reporting dimension
-- Payment events: explicit balance_cents_after on append (Paystack + app)
-- Admin list: fast last activity per invoice

-- ---------------------------------------------------------------------------
-- invoice_adjustments.category
-- ---------------------------------------------------------------------------
alter table public.invoice_adjustments
  add column if not exists category text not null default 'other'
    check (category in ('missed_visit', 'extra_service', 'discount', 'other'));

comment on column public.invoice_adjustments.category is
  'Preset classification for reporting (discounts, service failures, upsells). Free text remains in reason.';

-- ---------------------------------------------------------------------------
-- Snapshot: adjustment_applied includes category (trigger-owned JSON)
-- ---------------------------------------------------------------------------
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

    perform public.monthly_invoice_append_snapshot_event(
      inv_id,
      jsonb_build_object(
        'kind', 'adjustment_applied',
        'at', now(),
        'adjustment_id', new.id,
        'amount_cents', new.amount_cents,
        'reason', new.reason,
        'category', new.category
      )
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Last event timestamp per invoice (admin list)
-- ---------------------------------------------------------------------------
create or replace function public.monthly_invoice_last_event_times(p_invoice_ids uuid[])
returns table (invoice_id uuid, last_event_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.invoice_id, max(e.created_at) as last_event_at
  from public.monthly_invoice_events e
  where e.invoice_id = any(p_invoice_ids)
  group by e.invoice_id;
$$;

comment on function public.monthly_invoice_last_event_times is
  'Latest monthly_invoice_events.created_at per invoice id; for admin list “last activity”.';

revoke all on function public.monthly_invoice_last_event_times(uuid[]) from public;
grant execute on function public.monthly_invoice_last_event_times(uuid[]) to service_role;
