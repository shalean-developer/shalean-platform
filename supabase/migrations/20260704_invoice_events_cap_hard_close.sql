-- Event log: append-only table + cap rolling JSON (last 50), hard-close flag, auto-close on paid.

-- ---------------------------------------------------------------------------
-- Full append-only event history (source of truth; snapshot_current stays capped)
-- ---------------------------------------------------------------------------
create table if not exists public.monthly_invoice_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.monthly_invoices (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists monthly_invoice_events_invoice_created_idx
  on public.monthly_invoice_events (invoice_id, created_at desc);

comment on table public.monthly_invoice_events is
  'Append-only audit log for invoice lifecycle; snapshot_current.events keeps last 50 for fast reads.';

alter table public.monthly_invoice_events enable row level security;
grant select, insert on public.monthly_invoice_events to service_role;

-- ---------------------------------------------------------------------------
-- Hard close: no further adjustments for that customer + invoice month
-- ---------------------------------------------------------------------------
alter table public.monthly_invoices
  add column if not exists is_closed boolean not null default false;

comment on column public.monthly_invoices.is_closed is
  'When true, no invoice_adjustments for this customer+month; use next month or reopen via admin. Auto-set when status becomes paid.';

create or replace function public.jsonb_array_tail(p_arr jsonb, p_max integer)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (
      select jsonb_agg(elem order by ord)
      from (
        select t.elem, t.ord
        from jsonb_array_elements(coalesce(p_arr, '[]'::jsonb)) with ordinality as t(elem, ord)
      ) x
      where x.ord > (
        select greatest(0, count(*)::int - p_max)
        from jsonb_array_elements(coalesce(p_arr, '[]'::jsonb)) e
      )
    ),
    '[]'::jsonb
  );
$$;

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

  if coalesce(p_event ->> 'kind', '') = 'adjustment_post_send' then
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

grant execute on function public.jsonb_array_tail(jsonb, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Block adjustments when month is hard-closed
-- ---------------------------------------------------------------------------
create or replace function public.invoice_adjustments_block_if_month_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.monthly_invoices mi
    where mi.customer_id = new.customer_id
      and mi.month = new.month_applied
      and mi.is_closed = true
  ) then
    raise exception 'invoice_adjustments_month_closed'
      using hint = 'This billing month is closed; use a future month_applied or reopen the invoice.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoice_adjustments_block_closed on public.invoice_adjustments;
create trigger trg_invoice_adjustments_block_closed
  before insert on public.invoice_adjustments
  for each row execute function public.invoice_adjustments_block_if_month_closed();

-- Post-send route must also respect close (defense in depth)
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
        'kind', 'adjustment_post_send',
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
-- Auto hard-close when invoice is fully paid
-- ---------------------------------------------------------------------------
create or replace function public.monthly_invoices_before_write_auto_close()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'paid' and coalesce(old.status, '') is distinct from 'paid' then
    new.is_closed := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_monthly_invoices_auto_close on public.monthly_invoices;
create trigger trg_monthly_invoices_auto_close
  before update of status on public.monthly_invoices
  for each row execute function public.monthly_invoices_before_write_auto_close();

-- Optional: admin hard-close without payment (e.g. accounting period end)
create or replace function public.monthly_invoice_hard_close(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.monthly_invoices
  set
    is_closed = true,
    updated_at = now()
  where id = p_invoice_id
    and status in ('draft', 'sent', 'partially_paid', 'overdue', 'paid');
end;
$$;

grant execute on function public.monthly_invoice_hard_close(uuid) to service_role;

grant execute on function public.monthly_invoice_append_snapshot_event(uuid, jsonb) to service_role;

-- Paid invoices are treated as closed for adjustments (align existing rows)
update public.monthly_invoices
set is_closed = true
where status = 'paid'
  and coalesce(is_closed, false) = false;
