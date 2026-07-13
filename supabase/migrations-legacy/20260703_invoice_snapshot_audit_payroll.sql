-- Final audit: dual snapshots + version, Paystack charge idempotency, applied_at,
-- overdue as is_overdue (status partially_paid preserved), account_billing_risk, payout_frozen_cents.

-- ---------------------------------------------------------------------------
-- monthly_invoices: split snapshot + version + overdue flag
-- ---------------------------------------------------------------------------
alter table public.monthly_invoices
  add column if not exists snapshot_at_finalize jsonb;

alter table public.monthly_invoices
  add column if not exists snapshot_current jsonb;

alter table public.monthly_invoices
  add column if not exists snapshot_version integer not null default 0 check (snapshot_version >= 0);

alter table public.monthly_invoices
  add column if not exists is_overdue boolean not null default false;

comment on column public.monthly_invoices.snapshot_at_finalize is
  'Immutable line-item snapshot taken when invoice first leaves draft (send or zero-close).';
comment on column public.monthly_invoices.snapshot_current is
  'Rolling audit view: starts as finalize copy + events[] for post-send adjustments and payments.';
comment on column public.monthly_invoices.snapshot_version is
  'Increments on each snapshot_current mutation (finalize=1 then +1 per payment/adj).';
comment on column public.monthly_invoices.is_overdue is
  'True when past due_date and still outstanding (coexists with status=partially_paid; do not use status=overdue for that).';

-- Migrate legacy single snapshot column if present
do $m$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'monthly_invoices' and column_name = 'snapshot_json'
  ) then
    update public.monthly_invoices
    set
      snapshot_at_finalize = coalesce(snapshot_at_finalize, snapshot_json),
      snapshot_current = coalesce(
        snapshot_current,
        jsonb_build_object(
          'schema', 'monthly_invoice_snapshot_current_v1',
          'at_finalize', snapshot_json,
          'events', '[]'::jsonb,
          'adjustments_applied_after_send', '[]'::jsonb
        )
      ),
      snapshot_version = case when snapshot_json is not null and snapshot_version = 0 then 1 else snapshot_version end
    where snapshot_json is not null;

    alter table public.monthly_invoices drop column snapshot_json;
  end if;
end
$m$;

-- Normalize legacy status "overdue" → sent + flag (partially_paid never downgraded)
update public.monthly_invoices
set
  status = case when status = 'overdue' then 'sent' else status end,
  is_overdue = case when status = 'overdue' then true else is_overdue end
where status = 'overdue';

-- ---------------------------------------------------------------------------
-- invoice_adjustments: audit timestamp when stamped to an invoice
-- ---------------------------------------------------------------------------
alter table public.invoice_adjustments
  add column if not exists applied_at timestamptz;

comment on column public.invoice_adjustments.applied_at is
  'When applied_to_invoice_id was set (draft finalize batch or immediate post-send apply).';

-- ---------------------------------------------------------------------------
-- Paystack charge idempotency (duplicate webhooks)
-- ---------------------------------------------------------------------------
create table if not exists public.monthly_invoice_paystack_charge_dedup (
  charge_reference text primary key,
  invoice_id uuid not null references public.monthly_invoices (id) on delete cascade,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists monthly_invoice_paystack_dedup_invoice_idx
  on public.monthly_invoice_paystack_charge_dedup (invoice_id);

comment on table public.monthly_invoice_paystack_charge_dedup is
  'One row per successful Paystack transaction reference applied to an invoice; prevents double-counting amount_paid_cents.';

alter table public.monthly_invoice_paystack_charge_dedup enable row level security;
grant select, insert, delete on public.monthly_invoice_paystack_charge_dedup to service_role;

-- ---------------------------------------------------------------------------
-- Append rolling audit event + bump snapshot_version (uses row totals after other updates)
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
begin
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

  v_cur := jsonb_set(
    v_cur,
    '{events}',
    coalesce(v_cur -> 'events', '[]'::jsonb) || jsonb_build_array(p_event),
    true
  );

  if coalesce(p_event ->> 'kind', '') = 'adjustment_post_send' then
    v_cur := jsonb_set(
      v_cur,
      '{adjustments_applied_after_send}',
      coalesce(v_cur -> 'adjustments_applied_after_send', '[]'::jsonb) || jsonb_build_array(p_event),
      true
    );
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

  update public.monthly_invoices
  set
    snapshot_current = v_cur,
    snapshot_version = coalesce(v_ver, 0) + 1,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;

grant execute on function public.monthly_invoice_append_snapshot_event(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Customer soft risk flag (Option B: do not block booking inserts in DB)
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists account_billing_risk text not null default 'ok'
    check (account_billing_risk in ('ok', 'at_risk'));

comment on column public.user_profiles.account_billing_risk is
  'at_risk when customer has an open overdue monthly invoice (is_overdue + balance); ops may gate booking UX.';

-- ---------------------------------------------------------------------------
-- Payout amount frozen at eligibility (never silently follow live line edits)
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists payout_frozen_cents integer;

comment on column public.bookings.payout_frozen_cents is
  'ZAR line in cents frozen when payout_status becomes eligible (invoice fully paid); payout batches use this, not live totals.';

-- ---------------------------------------------------------------------------
-- Post-send adjustment: stamp applied_at + audit snapshot
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
begin
  select id, status
  into inv_id, inv_status
  from public.monthly_invoices
  where customer_id = new.customer_id
    and month = new.month_applied
  limit 1;

  if inv_id is null then
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
-- When draft→sent/paid stamps adjustments, set applied_at
-- ---------------------------------------------------------------------------
create or replace function public.monthly_invoices_stamp_adjustments_applied_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('sent', 'paid') and coalesce(old.status, '') = 'draft' then
    update public.invoice_adjustments
    set
      applied_to_invoice_id = new.id,
      applied_at = coalesce(applied_at, now())
    where customer_id = new.customer_id
      and month_applied = new.month
      and applied_to_invoice_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_monthly_invoices_apply_adjustments on public.monthly_invoices;
create trigger trg_monthly_invoices_apply_adjustments
  after update of status on public.monthly_invoices
  for each row execute function public.monthly_invoices_stamp_adjustments_applied_at();

-- Re-apply same name as before migration (replaces body that only set applied_to_invoice_id)
-- Note: stamp now sets applied_at; snapshot_at_finalize is set by app on finalize, not here.

-- ---------------------------------------------------------------------------
-- DB helper: mark overdue flags + account risk (optional cron via RPC)
-- ---------------------------------------------------------------------------
create or replace function public.mark_monthly_invoice_overdue_flags(p_today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
begin
  update public.monthly_invoices
  set
    is_overdue = true,
    updated_at = now()
  where due_date < p_today
    and status in ('sent', 'partially_paid')
    and coalesce(total_amount_cents, 0) > coalesce(amount_paid_cents, 0);

  get diagnostics v_n = row_count;

  -- Clear stale flag when caught up
  update public.monthly_invoices
  set
    is_overdue = false,
    updated_at = now()
  where is_overdue = true
    and coalesce(total_amount_cents, 0) <= coalesce(amount_paid_cents, 0);

  -- Soft customer risk (Option B)
  update public.user_profiles up
  set account_billing_risk = 'at_risk', updated_at = now()
  where exists (
    select 1
    from public.monthly_invoices mi
    where mi.customer_id = up.id
      and mi.is_overdue = true
      and coalesce(mi.total_amount_cents, 0) > coalesce(mi.amount_paid_cents, 0)
  );

  update public.user_profiles up
  set account_billing_risk = 'ok', updated_at = now()
  where up.account_billing_risk = 'at_risk'
    and not exists (
      select 1
      from public.monthly_invoices mi
      where mi.customer_id = up.id
        and mi.is_overdue = true
        and coalesce(mi.total_amount_cents, 0) > coalesce(mi.amount_paid_cents, 0)
    );

  return v_n;
end;
$$;

grant execute on function public.mark_monthly_invoice_overdue_flags(date) to service_role;

drop function if exists public.monthly_invoices_after_sent_apply_adjustments();
