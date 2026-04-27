-- Phase 2: recurring bookings + auto-charge (Paystack authorization + payment-link fallback).

create table if not exists public.recurring_bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  address_id uuid references public.customer_saved_addresses (id) on delete set null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  days_of_week int[] not null,
  start_date date not null,
  end_date date,
  price numeric not null check (price >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  next_run_date date not null,
  last_generated_at timestamptz,
  paystack_authorization_code text,
  /** Full {@link BookingSnapshotV1} JSON — source for generated occurrence rows (locked + customer). */
  booking_snapshot_template jsonb not null default '{}'::jsonb,
  /** When set, generator skips creating a booking on this service date (Africa/Johannesburg). */
  skip_next_occurrence_date date,
  monthly_pattern text not null default 'mirror_start_date'
    check (monthly_pattern in ('mirror_start_date', 'nth_weekday', 'last_weekday')),
  monthly_nth smallint null
    check (monthly_nth is null or monthly_nth between 1 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_bookings_days_of_week_elems_chk check (
    cardinality(days_of_week) between 1 and 7
    and days_of_week <@ array[1, 2, 3, 4, 5, 6, 7]::int[]
  )
);

create index if not exists recurring_bookings_active_next_run_idx
  on public.recurring_bookings (status, next_run_date);

create index if not exists recurring_bookings_customer_idx
  on public.recurring_bookings (customer_id);

comment on table public.recurring_bookings is
  'Customer recurring schedule; cron generates pending_payment bookings and charges saved Paystack authorizations.';

comment on column public.recurring_bookings.monthly_pattern is
  'Monthly mode: mirror start_date week-ordinal, Nth weekday in month (monthly_nth), or last weekday in month.';

comment on column public.recurring_bookings.monthly_nth is
  'When monthly_pattern=nth_weekday: 1=first … 4=fourth occurrence of primary weekday (smallest days_of_week) in each month.';

drop trigger if exists trg_recurring_bookings_updated_at on public.recurring_bookings;
create or replace function public.recurring_bookings_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger trg_recurring_bookings_updated_at
  before update on public.recurring_bookings
  for each row execute function public.recurring_bookings_touch_updated_at();

alter table public.recurring_bookings enable row level security;

alter table public.bookings
  add column if not exists recurring_id uuid references public.recurring_bookings (id) on delete set null;

alter table public.bookings
  add column if not exists is_recurring_generated boolean not null default false;

alter table public.bookings
  add column if not exists auto_charge_attempted_at timestamptz;

alter table public.bookings
  add column if not exists payment_status text;

alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status is null or payment_status in ('pending', 'success', 'failed'));

comment on column public.bookings.recurring_id is 'Source recurring subscription when this row was spawned by the recurring engine.';
comment on column public.bookings.is_recurring_generated is 'True when created by /api/cron/generate-recurring-bookings.';
comment on column public.bookings.auto_charge_attempted_at is 'Last auto-charge attempt (idempotency / duplicate cron guard).';
comment on column public.bookings.payment_status is 'Optional payment sub-state (e.g. recurring auto_charge failed before paid).';

alter table public.bookings
  add column if not exists recurring_retry_count int not null default 0;

alter table public.bookings
  add column if not exists recurring_next_charge_attempt_at timestamptz;

alter table public.bookings
  add column if not exists recurring_last_charge_attempt_at timestamptz;

alter table public.bookings
  add column if not exists recurring_first_failure_at timestamptz;

alter table public.bookings
  add column if not exists recurring_fallback_at timestamptz;

alter table public.bookings
  add column if not exists recurring_precharge_notified_at timestamptz;

comment on column public.bookings.recurring_retry_count is 'Auto-charge attempts for this pending recurring-generated row.';
comment on column public.bookings.recurring_next_charge_attempt_at is 'Do not charge before this time (backoff / smart delay); null = eligible immediately.';
comment on column public.bookings.recurring_last_charge_attempt_at is 'Last Paystack charge_authorization attempt at.';
comment on column public.bookings.recurring_first_failure_at is 'First failed auto-charge (starts grace window for retries before fallback).';
comment on column public.bookings.recurring_fallback_at is 'Payment-link fallback was invoked after retries/grace.';
comment on column public.bookings.recurring_precharge_notified_at is 'Customer pre-charge reminder sent (cron).';

create unique index if not exists bookings_recurring_service_date_uidx
  on public.bookings (recurring_id, date)
  where recurring_id is not null and date is not null;

drop index if exists public.bookings_recurring_pending_charge_idx;
create index if not exists bookings_recurring_charge_due_idx
  on public.bookings (recurring_next_charge_attempt_at, status, is_recurring_generated)
  where status = 'pending_payment'
    and is_recurring_generated = true
    and recurring_fallback_at is null;

grant select, insert, update, delete on public.recurring_bookings to service_role;
