-- Admin invoice POST idempotency, last_activity definition, adjustment timeline fields,
-- index for (invoice_id, created_at DESC) list aggregation.

-- ---------------------------------------------------------------------------
-- Idempotency cache for admin invoice mutations (12 min TTL; client Idempotency-Key)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_api_idempotency (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  route text not null,
  invoice_id uuid not null references public.monthly_invoices (id) on delete cascade,
  action text not null,
  status_code smallint not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint admin_api_idempotency_uid unique (idempotency_key, route, invoice_id, action)
);

create index if not exists admin_api_idempotency_expires_idx
  on public.admin_api_idempotency (expires_at);

comment on table public.admin_api_idempotency is
  'Short-lived replay cache for admin POSTs. Key = Idempotency-Key header + route + invoice_id + action.';

alter table public.admin_api_idempotency enable row level security;

grant select, insert, delete on public.admin_api_idempotency to service_role;

-- ---------------------------------------------------------------------------
-- Last activity: max(created_at) over financially meaningful events only
-- (excludes snapshot-only noise; includes resend/reminder when present)
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
    and coalesce(e.payload ->> 'kind', '') in (
      'payment_received',
      'payment_applied',
      'adjustment_applied',
      'adjustment_post_send',
      'admin_mark_paid',
      'invoice_finalized',
      'finalize',
      'invoice_closed',
      'invoice_resent',
      'invoice_reminder_sent'
    )
  group by e.invoice_id;
$$;

comment on function public.monthly_invoice_last_event_times(uuid[]) is
  'Latest monthly_invoice_events.created_at per invoice for admin list “last activity”: payments, adjustments, finalize/close, manual mark paid, invoice resend/reminder — not reads or non-financial snapshot churn.';

-- ---------------------------------------------------------------------------
-- Index: supports max(created_at) per invoice_id (DESC scan-friendly)
-- ---------------------------------------------------------------------------
drop index if exists public.idx_monthly_invoice_events_invoice_id_created_at;

create index if not exists idx_mi_last_event_invoice_id_created_at
  on public.monthly_invoice_events (invoice_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Adjustment applied event: monetary audit fields for support timeline
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
