-- Operational vs financial lock, partial payments + balance, invoice snapshot,
-- post-sent adjustments, booking payout_status, overdue lifecycle.

-- ---------------------------------------------------------------------------
-- monthly_invoices: extended status, payments, snapshot, balance (generated)
-- ---------------------------------------------------------------------------
alter table public.monthly_invoices drop constraint if exists monthly_invoices_status_check;
alter table public.monthly_invoices
  add constraint monthly_invoices_status_check
  check (status in ('draft', 'sent', 'partially_paid', 'paid', 'overdue'));

comment on column public.monthly_invoices.status is
  'draft → sent (or zero → paid). partially_paid when Paystack received < balance. overdue = sent/partially_paid past due_date.';

alter table public.monthly_invoices
  add column if not exists amount_paid_cents bigint not null default 0;

alter table public.monthly_invoices drop constraint if exists monthly_invoices_amount_paid_cents_check;
alter table public.monthly_invoices
  add constraint monthly_invoices_amount_paid_cents_check check (amount_paid_cents >= 0);

alter table public.monthly_invoices
  add column if not exists snapshot_json jsonb;

comment on column public.monthly_invoices.amount_paid_cents is
  'Cumulative customer payments (Paystack) toward this invoice; balance_cents = total_amount_cents - amount_paid_cents.';
comment on column public.monthly_invoices.snapshot_json is
  'Immutable snapshot at first send (or zero-close): bookings, adjustments, totals for disputes/audit.';

-- balance_cents: remaining customer liability (<=0 means fully/over paid)
do $b$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monthly_invoices'
      and column_name = 'balance_cents'
  ) then
    alter table public.monthly_invoices
      add column balance_cents bigint generated always as (total_amount_cents - amount_paid_cents) stored;
  end if;
end
$b$;

comment on column public.monthly_invoices.balance_cents is
  'Generated: total_amount_cents - amount_paid_cents (remaining due; <=0 means over/fully paid).';

-- ---------------------------------------------------------------------------
-- Bookings: payout gate for monthly-invoice Option A
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists payout_status text not null default 'pending'
    check (payout_status in ('pending', 'eligible', 'paid'));

comment on column public.bookings.payout_status is
  'Cleaner-side payout: pending until customer monthly invoice fully paid; then eligible for payout batch.';

create index if not exists bookings_payout_status_idx
  on public.bookings (payout_status)
  where payout_status = 'eligible';

-- ---------------------------------------------------------------------------
-- Lock: allow operational reschedule (date/time) under finalized invoice
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
  if v_st is null or v_st not in ('sent', 'partially_paid', 'overdue', 'paid') then
    return new;
  end if;

  -- Allow monthly invoice settlement (full webhook / zero-close) on linked rows
  if coalesce(old.payment_status, '') = 'pending_monthly'
     and coalesce(new.payment_status, '') = 'success'
     and new.status is not distinct from old.status
     and new.total_paid_zar is not distinct from old.total_paid_zar
     and new.user_id is not distinct from old.user_id
     and new.monthly_invoice_id is not distinct from old.monthly_invoice_id
     and (
       new.payment_status is distinct from old.payment_status
       or new.amount_paid_cents is distinct from old.amount_paid_cents
     )
  then
    return new;
  end if;

  -- Financial + cancel only (date/time/cleaner/dispatch are operational — not listed here)
  if new.total_paid_zar is distinct from old.total_paid_zar
     or new.amount_paid_cents is distinct from old.amount_paid_cents
     or new.monthly_invoice_id is distinct from old.monthly_invoice_id
     or new.user_id is distinct from old.user_id
     or new.payment_status is distinct from old.payment_status
     or (
       new.status is distinct from old.status
       and coalesce(new.status, '') = 'cancelled'
     )
  then
    raise exception 'booking_update_blocked_monthly_invoice_finalized'
      using hint = 'Invoice is finalized; financial/cancel changes are blocked. Reschedule date/time is allowed. Use invoice_adjustments for credits/charges.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_lock_finalized_invoice on public.bookings;
create trigger trg_bookings_lock_finalized_invoice
  before update of total_paid_zar, amount_paid_cents, monthly_invoice_id, user_id, payment_status, status
  on public.bookings
  for each row execute function public.bookings_lock_under_finalized_monthly_invoice();

-- ---------------------------------------------------------------------------
-- Delete: treat partially_paid and overdue like sent
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
    if v_status in ('sent', 'partially_paid', 'overdue', 'paid') then
      raise exception 'booking_delete_blocked_monthly_invoice_finalized'
        using hint = 'Invoice is finalized; use invoice_adjustments instead of deleting the booking row.';
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

-- ---------------------------------------------------------------------------
-- Rule: adjustment INSERT after invoice is sent (not paid) → apply to open invoice immediately
-- Draft: leave unapplied (recompute_monthly_invoice_totals includes unapplied).
-- Paid: leave unapplied — ops must use a future month_applied for the next open draft.
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
    set applied_to_invoice_id = inv_id
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invoice_adjustments_after_ins on public.invoice_adjustments;
create trigger trg_invoice_adjustments_after_ins
  after insert on public.invoice_adjustments
  for each row execute function public.invoice_adjustments_after_insert_route();

comment on function public.invoice_adjustments_after_insert_route is
  'Post-send corrections: if an invoice row exists for customer+month in sent/partially_paid/overdue, bump total immediately and stamp applied_to_invoice_id. If month is already paid, insert with a future month_applied for the next draft.';
