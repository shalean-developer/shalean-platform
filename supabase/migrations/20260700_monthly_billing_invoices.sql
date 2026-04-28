-- Monthly consolidated invoicing + customer billing/schedule types.
-- Idempotent: safe to re-run fragments via IF NOT EXISTS / DROP IF EXISTS patterns.

-- ---------------------------------------------------------------------------
-- Customer profile: billing and scheduling model
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists billing_type text not null default 'per_booking'
    check (billing_type in ('per_booking', 'monthly'));

alter table public.user_profiles
  add column if not exists schedule_type text not null default 'on_demand'
    check (schedule_type in ('fixed_schedule', 'on_demand'));

comment on column public.user_profiles.billing_type is
  'per_booking: Paystack per checkout (default). monthly: jobs roll into MonthlyInvoice; settled at month-end.';
comment on column public.user_profiles.schedule_type is
  'fixed_schedule: recurring_bookings cron may spawn visits. on_demand: no auto-generated visits.';

create index if not exists user_profiles_billing_schedule_idx
  on public.user_profiles (billing_type, schedule_type);

-- ---------------------------------------------------------------------------
-- Monthly invoices (one row per customer per calendar bucket month YYYY-MM)
-- ---------------------------------------------------------------------------
create table if not exists public.monthly_invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  total_bookings integer not null default 0 check (total_bookings >= 0),
  total_amount_cents bigint not null default 0 check (total_amount_cents >= 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  due_date date not null,
  paystack_reference text unique,
  payment_link text,
  sent_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_invoices_customer_month_uid unique (customer_id, month)
);

create index if not exists monthly_invoices_status_month_idx
  on public.monthly_invoices (status, month);

create index if not exists monthly_invoices_customer_idx
  on public.monthly_invoices (customer_id);

comment on table public.monthly_invoices is
  'B2B-style monthly bill: draft accumulates bookings; last day of month finalizes, Paystack link, sent; paid closes bookings.';

drop trigger if exists trg_monthly_invoices_updated_at on public.monthly_invoices;
create or replace function public.monthly_invoices_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger trg_monthly_invoices_updated_at
  before update on public.monthly_invoices
  for each row execute function public.monthly_invoices_touch_updated_at();

alter table public.monthly_invoices enable row level security;

drop policy if exists monthly_invoices_select_own on public.monthly_invoices;
create policy monthly_invoices_select_own
  on public.monthly_invoices for select to authenticated
  using (customer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Bookings → invoice link + extended payment_status
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists monthly_invoice_id uuid references public.monthly_invoices (id) on delete set null;

create index if not exists bookings_monthly_invoice_id_idx
  on public.bookings (monthly_invoice_id)
  where monthly_invoice_id is not null;

comment on column public.bookings.monthly_invoice_id is
  'Set by trigger for monthly-billed customers (draft invoice for service bucket month).';

alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings
  add constraint bookings_payment_status_check
  check (
    payment_status is null
    or payment_status in ('pending', 'success', 'failed', 'pending_monthly')
  );

comment on column public.bookings.payment_status is
  'Sub-state: pending_monthly = included on open MonthlyInvoice; no per-booking Paystack link.';

-- ---------------------------------------------------------------------------
-- Bucket month (Africa/Johannesburg): last-day-of-service + created same day after cutoff → next month
-- ---------------------------------------------------------------------------
create or replace function public.monthly_invoice_bucket_month(
  p_created_at timestamptz,
  p_service_date text,
  p_cutoff_hour smallint default 18
)
returns text
language plpgsql
stable
as $$
declare
  v_service date;
  v_jhb timestamptz;
  v_last_day date;
begin
  if p_created_at is null then
    return null;
  end if;
  if p_service_date is null or btrim(p_service_date) = '' then
    return null;
  end if;
  begin
    v_service := p_service_date::date;
  exception when others then
    return null;
  end;

  v_jhb := p_created_at at time zone 'Africa/Johannesburg';
  v_last_day := (date_trunc('month', v_service::timestamp)::date + interval '1 month - 1 day')::date;

  if v_service = v_last_day
     and (v_jhb::date) = v_service
     and extract(hour from v_jhb)::int >= coalesce(p_cutoff_hour, 18)
  then
    return to_char(v_service + interval '1 month', 'YYYY-MM');
  end if;

  return to_char(v_service, 'YYYY-MM');
end;
$$;

comment on function public.monthly_invoice_bucket_month is
  'YYYY-MM bucket for monthly invoice rows. Last service day + same-day JHB creation after cutoff_hour rolls forward one month.';

-- ---------------------------------------------------------------------------
-- Line amount in cents from booking (total_paid_zar is whole ZAR on generated rows)
-- ---------------------------------------------------------------------------
create or replace function public.booking_line_amount_cents(p_total_paid_zar integer, p_amount_paid_cents integer)
returns bigint
language sql
immutable
as $$
  select case
    when coalesce(p_amount_paid_cents, 0) > 0 then greatest(0, p_amount_paid_cents::bigint)
    when coalesce(p_total_paid_zar, 0) > 0 then greatest(0, p_total_paid_zar::bigint * 100)
    else 0::bigint
  end;
$$;

-- ---------------------------------------------------------------------------
-- Attach booking to draft invoice (monthly customers only)
-- First attachment: INSERT, or UPDATE when monthly_invoice_id was still null (e.g. user_id backfilled).
-- Cancellations / deletes adjust draft totals. Finalize cron recomputes from rows for authoritative totals.
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

  -- Cancellation: adjust draft invoice totals only
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

  -- Only consolidated-billing rows (never attach self-serve per-booking checkouts)
  if coalesce(new.payment_status, '') is distinct from 'pending_monthly' then
    return new;
  end if;

  -- Already linked (typical UPDATE paths): avoid double-count; finalize recomputes totals anyway
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

drop trigger if exists trg_bookings_monthly_invoice_ins on public.bookings;
create trigger trg_bookings_monthly_invoice_ins
  before insert on public.bookings
  for each row execute function public.bookings_after_write_monthly_invoice();

drop trigger if exists trg_bookings_monthly_invoice_upd on public.bookings;
create trigger trg_bookings_monthly_invoice_upd
  before update of user_id, date, total_paid_zar, amount_paid_cents, status, created_at on public.bookings
  for each row execute function public.bookings_after_write_monthly_invoice();

drop trigger if exists trg_bookings_monthly_invoice_del on public.bookings;
create trigger trg_bookings_monthly_invoice_del
  before delete on public.bookings
  for each row execute function public.bookings_before_delete_monthly_invoice();

grant select, insert, update, delete on public.monthly_invoices to service_role;

-- RPC: recompute draft invoice totals from attached bookings (finalize step)
create or replace function public.recompute_monthly_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_cnt integer;
  v_sum bigint;
begin
  select status into v_status from public.monthly_invoices where id = p_invoice_id;
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

  update public.monthly_invoices
  set total_bookings = v_cnt, total_amount_cents = v_sum, updated_at = now()
  where id = p_invoice_id and status = 'draft';
end;
$$;

grant execute on function public.recompute_monthly_invoice_totals(uuid) to service_role;
