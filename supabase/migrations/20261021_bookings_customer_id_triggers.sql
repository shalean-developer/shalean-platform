-- Production bookings use customer_id (auth.users.id); legacy schemas used user_id.
-- Triggers that referenced NEW.user_id fail with: record "new" has no field "user_id".

alter table public.bookings
  add column if not exists customer_id uuid references auth.users (id) on delete set null;

create index if not exists bookings_customer_id_idx
  on public.bookings (customer_id)
  where customer_id is not null;

-- Drop triggers that invoke legacy user_id functions before replacing function bodies.
drop trigger if exists auto_link_booking_user on public.bookings;
drop trigger if exists trg_bookings_monthly_invoice_ins on public.bookings;
drop trigger if exists trg_bookings_monthly_invoice_upd on public.bookings;
drop trigger if exists trg_bookings_lock_finalized_invoice on public.bookings;
drop trigger if exists update_user_tier_trigger on public.bookings;

-- Backfill customer_id from legacy user_id when that column still exists.
do $backfill$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'user_id'
  ) then
    update public.bookings
    set customer_id = user_id
    where customer_id is null
      and user_id is not null;
  end if;
end
$backfill$;

create or replace function public.link_booking_to_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is null
     and new.customer_email is not null
     and length(trim(new.customer_email)) > 0 then
    new.customer_id := public.resolve_auth_user_id_by_email(new.customer_email);
  end if;
  return new;
end;
$$;

comment on function public.link_booking_to_user() is
  'Safety net: sets bookings.customer_id from auth.users when insert omits customer_id but customer_email matches.';

update public.bookings b
set customer_id = public.resolve_auth_user_id_by_email(b.customer_email)
where b.customer_id is null
  and b.customer_email is not null
  and length(trim(b.customer_email)) > 0
  and public.resolve_auth_user_id_by_email(b.customer_email) is not null;

-- Latest monthly-invoice hook body (20261010) with customer_id ownership.
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

  if new.customer_id is not null then
    select coalesce(up.billing_type, 'per_booking')
    into v_billing
    from public.user_profiles up
    where up.id = new.customer_id;

    if v_billing = 'monthly' then
      if coalesce(new.payment_status, '') not in ('success', 'failed') then
        new.payment_status := 'pending_monthly';
        new.is_monthly_billing_booking := true;
      end if;
    end if;
  end if;

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

  if new.customer_id is null then
    return new;
  end if;

  select coalesce(up.billing_type, 'per_booking')
  into v_billing
  from public.user_profiles up
  where up.id = new.customer_id;

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
    new.customer_id,
    v_bucket,
    'draft',
    public.monthly_invoice_due_date(v_bucket)
  )
  on conflict (customer_id, month) do nothing;

  select id, status into v_inv_id, v_inv_status
  from public.monthly_invoices
  where customer_id = new.customer_id and month = v_bucket
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

  if coalesce(old.payment_status, '') = 'pending_monthly'
     and coalesce(new.payment_status, '') = 'success'
     and new.status is not distinct from old.status
     and new.total_paid_zar is not distinct from old.total_paid_zar
     and new.customer_id is not distinct from old.customer_id
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
     or new.customer_id is distinct from old.customer_id
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

create or replace function public.trg_bookings_completed_refresh_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
     and (old.status is distinct from 'completed')
     and new.customer_id is not null then
    perform public.recalculate_user_tier(new.customer_id);
  end if;
  return new;
end;
$$;

drop trigger if exists auto_link_booking_user on public.bookings;
create trigger auto_link_booking_user
  before insert on public.bookings
  for each row
  execute function public.link_booking_to_user();

drop trigger if exists trg_bookings_monthly_invoice_ins on public.bookings;
create trigger trg_bookings_monthly_invoice_ins
  before insert on public.bookings
  for each row execute function public.bookings_after_write_monthly_invoice();

drop trigger if exists trg_bookings_monthly_invoice_upd on public.bookings;
create trigger trg_bookings_monthly_invoice_upd
  before update of customer_id, date, total_paid_zar, amount_paid_cents, status, created_at on public.bookings
  for each row execute function public.bookings_after_write_monthly_invoice();

drop trigger if exists trg_bookings_lock_finalized_invoice on public.bookings;
create trigger trg_bookings_lock_finalized_invoice
  before update of total_paid_zar, amount_paid_cents, monthly_invoice_id, customer_id, payment_status, status
  on public.bookings
  for each row execute function public.bookings_lock_under_finalized_monthly_invoice();

drop trigger if exists update_user_tier_trigger on public.bookings;
create trigger update_user_tier_trigger
  after update of status on public.bookings
  for each row
  when (new.status = 'completed' and (old.status is distinct from 'completed'))
  execute function public.trg_bookings_completed_refresh_tier();

drop index if exists public.idx_bookings_unique_active_customer_slot;
create unique index if not exists idx_bookings_unique_active_customer_slot
  on public.bookings (customer_id, date, time, service_slug)
  where customer_id is not null
    and coalesce(slot_duplicate_exempt, false) = false
    and status not in ('cancelled', 'failed', 'payment_expired');

comment on index public.idx_bookings_unique_active_customer_slot is
  'Hard backstop: at most one non-exempt active booking per (customer_id, date, time, service_slug).';

create index if not exists bookings_customer_id_created_at_idx
  on public.bookings (customer_id, created_at desc)
  where customer_id is not null;
