-- Event kind alignment, timeline index name, invoice_closed audit, currency_code, append() supports legacy adjustment kinds.

-- ---------------------------------------------------------------------------
-- Multi-currency placeholder (all amounts today are ZAR cents)
-- ---------------------------------------------------------------------------
alter table public.monthly_invoices
  add column if not exists currency_code text not null default 'ZAR';

comment on column public.monthly_invoices.currency_code is
  'ISO 4217; amounts on this row are in this currency minor units (cents). Default ZAR.';

-- ---------------------------------------------------------------------------
-- Query pattern: WHERE invoice_id = ? ORDER BY created_at
-- ---------------------------------------------------------------------------
drop index if exists public.monthly_invoice_events_invoice_created_idx;

create index if not exists idx_monthly_invoice_events_invoice_id_created_at
  on public.monthly_invoice_events (invoice_id, created_at);

-- ---------------------------------------------------------------------------
-- Rolling snapshot: accept adjustment_applied (new) + adjustment_post_send (legacy)
-- ---------------------------------------------------------------------------
create or replace function public.monthly_invoice_append_snapshot_event(p_invoice_id uuid, p_event jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur jsonb;
  v_ver integer;
  v_total bigint;
  v_paid bigint;
  v_events jsonb;
  v_adj jsonb;
  v_kind text;
  const_max constant integer := 50;
begin
  insert into public.monthly_invoice_events (invoice_id, kind, payload)
  values (
    p_invoice_id,
    coalesce(p_event ->> 'kind', 'unknown'),
    p_event
  );

  select
    snapshot_current,
    snapshot_version,
    total_amount_cents,
    amount_paid_cents
  into v_cur, v_ver, v_total, v_paid
  from public.monthly_invoices
  where id = p_invoice_id
  for update;

  if not found then
    return;
  end if;

  v_cur := coalesce(
    v_cur,
    jsonb_build_object(
      'schema', 'monthly_invoice_snapshot_current_v1',
      'events', '[]'::jsonb,
      'adjustments_applied_after_send', '[]'::jsonb
    )
  );

  v_events := public.jsonb_array_tail(
    coalesce(v_cur -> 'events', '[]'::jsonb) || jsonb_build_array(p_event),
    const_max
  );

  v_cur := jsonb_set(v_cur, '{events}', v_events, true);

  v_kind := coalesce(p_event ->> 'kind', '');
  if v_kind in ('adjustment_applied', 'adjustment_post_send') then
    v_adj := public.jsonb_array_tail(
      coalesce(v_cur -> 'adjustments_applied_after_send', '[]'::jsonb) || jsonb_build_array(p_event),
      const_max
    );
    v_cur := jsonb_set(v_cur, '{adjustments_applied_after_send}', v_adj, true);
  end if;

  v_cur := jsonb_set(
    v_cur,
    '{last_totals}',
    jsonb_build_object(
      'total_amount_cents', coalesce(v_total, 0),
      'amount_paid_cents', coalesce(v_paid, 0),
      'balance_cents', greatest(0, coalesce(v_total, 0) - coalesce(v_paid, 0))
    ),
    true
  );

  v_cur := jsonb_set(v_cur, '{events_tail_max}', to_jsonb(const_max), true);

  update public.monthly_invoices
  set
    snapshot_current = v_cur,
    snapshot_version = coalesce(v_ver, 0) + 1,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Post-send adjustment event kind (app + analytics)
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
        'reason', new.reason
      )
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Paid transition: append invoice_closed (after payment_received from app)
-- ---------------------------------------------------------------------------
create or replace function public.monthly_invoices_after_status_paid_append_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and coalesce(old.status, '') is distinct from 'paid' then
    perform public.monthly_invoice_append_snapshot_event(
      new.id,
      jsonb_build_object(
        'kind', 'invoice_closed',
        'at', now(),
        'via', 'paid'
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_monthly_invoices_invoice_closed_event on public.monthly_invoices;
create trigger trg_monthly_invoices_invoice_closed_event
  after update of status on public.monthly_invoices
  for each row execute function public.monthly_invoices_after_status_paid_append_closed();

-- ---------------------------------------------------------------------------
-- Manual hard close: append invoice_closed (status-only trigger does not run)
-- ---------------------------------------------------------------------------
create or replace function public.monthly_invoice_hard_close(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev boolean;
  v_n integer;
begin
  select is_closed into v_prev from public.monthly_invoices where id = p_invoice_id;
  if not found or coalesce(v_prev, false) then
    return;
  end if;

  update public.monthly_invoices
  set
    is_closed = true,
    updated_at = now()
  where id = p_invoice_id
    and status in ('draft', 'sent', 'partially_paid', 'overdue', 'paid');

  get diagnostics v_n = row_count;
  if v_n = 1 then
    perform public.monthly_invoice_append_snapshot_event(
      p_invoice_id,
      jsonb_build_object(
        'kind', 'invoice_closed',
        'at', now(),
        'via', 'manual'
      )
    );
  end if;
end;
$$;

grant execute on function public.monthly_invoice_append_snapshot_event(uuid, jsonb) to service_role;
grant execute on function public.monthly_invoice_hard_close(uuid) to service_role;
