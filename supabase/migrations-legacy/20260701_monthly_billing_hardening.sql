-- Hardening: invoice lock after sent/paid, invoice_adjustments, DB-enforce monthly payment_status,
-- is_monthly_billing_booking, idempotent finalize window, closure_reason, payout policy comment.

-- ---------------------------------------------------------------------------
-- Bookings: explicit monthly-billing flag (do not rely on paystack_reference prefix)
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists is_monthly_billing_booking boolean not null default false;

comment on column public.bookings.is_monthly_billing_booking is
  'True when this row is on consolidated monthly billing (DB-enforced for billing_type=monthly).';

-- ---------------------------------------------------------------------------
-- Invoices: optional closure context (e.g. zero_amount)
-- ---------------------------------------------------------------------------
alter table public.monthly_invoices
  add column if not exists closure_reason text;

comment on column public.monthly_invoices.closure_reason is
  'Why a terminal state was reached without Paystack (e.g. zero_amount).';

comment on table public.monthly_invoices is
  'B2B-style monthly bill. Cleaner compensation policy: accrue per job but release/settle payouts only after customer invoice is paid (Option A — business carries float until paid).';

-- ---------------------------------------------------------------------------
-- Post-invoice corrections (applied onto draft totals for month_applied)
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_adjustments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null,
  reason text not null,
  month_applied text not null check (month_applied ~ '^\d{4}-\d{2}$'),
  applied_to_invoice_id uuid references public.monthly_invoices (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists invoice_adjustments_pending_idx
  on public.invoice_adjustments (customer_id, month_applied)
  where applied_to_invoice_id is null;

comment on table public.invoice_adjustments is
  'Credits/charges not tied to a single booking; summed into draft invoice for month_applied; stamped when invoice is sent.';

alter table public.invoice_adjustments enable row level security;

drop policy if exists invoice_adjustments_select_own on public.invoice_adjustments;
create policy invoice_adjustments_select_own
  on public.invoice_adjustments for select to authenticated
  using (customer_id = auth.uid());

grant select, insert, update, delete on public.invoice_adjustments to service_role;

-- ---------------------------------------------------------------------------
-- Lock bookings linked to sent/paid invoices (financial + cancel + delete)
-- ---------------------------------------------------------------------------
create or replace function public.bookings_lock_under_finalized_monthly_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_st text;
begin
  if old.monthly_invoice_id is null then
    return new;
  end if;
  select status into v_st from public.monthly_invoices where id = old.monthly_invoice_id;
  if v_st is null or v_st not in ('sent', 'paid') then
    return new;
  end if;

  -- Allow monthly invoice settlement (Paystack webhook / zero-close) on linked rows
  if coalesce(old.payment_status, '') = 'pending_monthly'
     and coalesce(new.payment_status, '') = 'success'
     and new.status is not distinct from old.status
     and new.total_paid_zar is not distinct from old.total_paid_zar
     and new.date is not distinct from old.date
     and new.user_id is not distinct from old.user_id
     and new.monthly_invoice_id is not distinct from old.monthly_invoice_id
     and (
       new.payment_status is distinct from old.payment_status
       or new.amount_paid_cents is distinct from old.amount_paid_cents
     )
  then
    return new;
  end if;

  if new.total_paid_zar is distinct from old.total_paid_zar
     or new.amount_paid_cents is distinct from old.amount_paid_cents
     or new.monthly_invoice_id is distinct from old.monthly_invoice_id
     or new.date is distinct from old.date
     or new.user_id is distinct from old.user_id
     or new.payment_status is distinct from old.payment_status
     or (
       new.status is distinct from old.status
       and coalesce(new.status, '') = 'cancelled'
     )
  then
    raise exception 'booking_update_blocked_monthly_invoice_finalized'
      using hint = 'Invoice is sent or paid; financial/cancel changes are blocked. Use invoice_adjustments.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_lock_finalized_invoice_del on public.bookings;

drop trigger if exists trg_bookings_lock_finalized_invoice on public.bookings;
create trigger trg_bookings_lock_finalized_invoice
  before update of total_paid_zar, amount_paid_cents, monthly_invoice_id, date, user_id, payment_status, status
  on public.bookings
  for each row execute function public.bookings_lock_under_finalized_monthly_invoice();

-- ---------------------------------------------------------------------------
-- Stamp adjustments when invoice leaves draft → sent
-- ---------------------------------------------------------------------------
create or replace function public.monthly_invoices_after_sent_apply_adjustments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('sent', 'paid') and coalesce(old.status, '') = 'draft' then
    update public.invoice_adjustments
    set applied_to_invoice_id = new.id
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
  for each row execute function public.monthly_invoices_after_sent_apply_adjustments();

-- ---------------------------------------------------------------------------
-- Recompute: bookings subtotal + unapplied adjustments for same customer/month
-- ---------------------------------------------------------------------------
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
    and ia.applied_to_invoice_id is null;

  v_total := greatest(0::bigint, v_sum + v_adj);

  update public.monthly_invoices
  set
    total_bookings = v_cnt,
    total_amount_cents = v_total,
    updated_at = now()
  where id = p_invoice_id and status = 'draft';
end;
$$;

-- ---------------------------------------------------------------------------
-- Monthly invoice attach + enforce payment_status / is_monthly_billing_booking
-- (replaces public.bookings_after_write_monthly_invoice from 20260700)
-- ---------------------------------------------------------------------------
create or replace function public.bookings_after_write_monthly_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billing text;
  v_bucket text;
  v_inv_id uuid;
  v_inv_status text;
  v_line bigint;
  v_cutoff smallint;
  v_old_line bigint;
begin
  begin
    v_cutoff := nullif(trim(current_setting('app.monthly_invoice_last_day_cutoff_hour', true)), '')::smallint;
  exception when others then
    v_cutoff := null;
  end;
  v_cutoff := coalesce(v_cutoff, 18::smallint);

  -- DB-enforce: monthly customers → pending_monthly (+ flag), except terminal payment states
  if new.user_id is not null then
    select coalesce(up.billing_type, 'per_booking')
    into v_billing
    from public.user_profiles up
    where up.id = new.user_id;

    if v_billing = 'monthly' then
      if coalesce(new.payment_status, '') not in ('success', 'failed') then
        new.payment_status := 'pending_monthly';
        new.is_monthly_billing_booking := true;
      end if;
    end if;
  end if;

  -- Cancellation: adjust draft invoice totals only (blocked when sent/paid by lock trigger)
  if tg_op = 'UPDATE'
     and coalesce(old.status, '') is distinct from 'cancelled'
     and coalesce(new.status, '') = 'cancelled'
     and old.monthly_invoice_id is not null
  then
    select status into v_inv_status from public.monthly_invoices where id = old.monthly_invoice_id;
    if v_inv_status = 'draft' then
      v_old_line := public.booking_line_amount_cents(old.total_paid_zar, old.amount_paid_cents);
      update public.monthly_invoices
      set
        total_bookings = greatest(0, total_bookings - 1),
        total_amount_cents = greatest(0, total_amount_cents - v_old_line),
        updated_at = now()
      where id = old.monthly_invoice_id;
    end if;
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  select coalesce(up.billing_type, 'per_booking')
  into v_billing
  from public.user_profiles up
  where up.id = new.user_id;

  if v_billing is distinct from 'monthly' then
    return new;
  end if;

  if coalesce(new.status, '') = 'cancelled' then
    return new;
  end if;

  if coalesce(new.payment_status, '') is distinct from 'pending_monthly' then
    return new;
  end if;

  if new.monthly_invoice_id is not null then
    return new;
  end if;

  v_bucket := public.monthly_invoice_bucket_month(new.created_at, new.date, v_cutoff);
  if v_bucket is null then
    return new;
  end if;

  v_line := public.booking_line_amount_cents(new.total_paid_zar, new.amount_paid_cents);

  insert into public.monthly_invoices (customer_id, month, status, due_date)
  values (
    new.user_id,
    v_bucket,
    'draft',
    ((v_bucket || '-01')::date + interval '1 month' + interval '13 days')::date
  )
  on conflict (customer_id, month) do nothing;

  select id, status into v_inv_id, v_inv_status
  from public.monthly_invoices
  where customer_id = new.user_id and month = v_bucket
  limit 1;

  if v_inv_id is null or v_inv_status is distinct from 'draft' then
    return new;
  end if;

  new.monthly_invoice_id := v_inv_id;
  update public.monthly_invoices
  set
    total_bookings = total_bookings + 1,
    total_amount_cents = total_amount_cents + v_line,
    updated_at = now()
  where id = v_inv_id and status = 'draft';

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete: block when invoice finalized; else draft decrement (unchanged)
-- ---------------------------------------------------------------------------
create or replace function public.bookings_before_delete_monthly_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_line bigint;
begin
  if old.monthly_invoice_id is not null then
    select status into v_status from public.monthly_invoices where id = old.monthly_invoice_id;
    if v_status in ('sent', 'paid') then
      raise exception 'booking_delete_blocked_monthly_invoice_finalized'
        using hint = 'Invoice is sent or paid; use invoice_adjustments instead of deleting the booking row.';
    end if;
  end if;

  if old.monthly_invoice_id is null then
    return old;
  end if;
  select status into v_status from public.monthly_invoices where id = old.monthly_invoice_id;
  if v_status is distinct from 'draft' then
    return old;
  end if;
  if coalesce(old.status, '') = 'cancelled' then
    return old;
  end if;
  v_line := public.booking_line_amount_cents(old.total_paid_zar, old.amount_paid_cents);
  update public.monthly_invoices
  set
    total_bookings = greatest(0, total_bookings - 1),
    total_amount_cents = greatest(0, total_amount_cents - v_line),
    updated_at = now()
  where id = old.monthly_invoice_id;
  return old;
end;
$$;

grant execute on function public.recompute_monthly_invoice_totals(uuid) to service_role;

-- Backfill flag for existing rows
update public.bookings
set is_monthly_billing_booking = true
where coalesce(payment_status, '') = 'pending_monthly'
  and is_monthly_billing_booking is not true;
