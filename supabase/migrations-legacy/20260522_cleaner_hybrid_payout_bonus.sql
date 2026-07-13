-- Hybrid cleaner payout model: base payout cap + bonus, with persisted totals.

alter table public.bookings add column if not exists amount_paid_cents integer;
alter table public.bookings add column if not exists total_paid_zar numeric;
alter table public.bookings add column if not exists total_paid_cents integer;
alter table public.bookings add column if not exists base_amount_cents integer;
alter table public.bookings add column if not exists extras_amount_cents integer default 0;
alter table public.bookings add column if not exists service_fee_cents integer not null default 0;
alter table public.bookings add column if not exists cleaner_payout_cents integer;
alter table public.bookings add column if not exists cleaner_bonus_cents integer default 0;
alter table public.bookings add column if not exists company_revenue_cents integer;
alter table public.bookings add column if not exists payout_percentage numeric(5, 4);
alter table public.bookings add column if not exists payout_type text;
alter table public.bookings add column if not exists is_test boolean not null default false;

create table if not exists public.cleaner_payouts (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  total_amount_cents integer not null check (total_amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'cancelled')),
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid,
  paid_at timestamptz
);

alter table public.bookings add column if not exists payout_id uuid references public.cleaner_payouts (id) on delete set null;

create index if not exists cleaner_payouts_cleaner_id_idx on public.cleaner_payouts (cleaner_id);
create index if not exists cleaner_payouts_status_idx on public.cleaner_payouts (status);
create index if not exists cleaner_payouts_period_idx on public.cleaner_payouts (period_start, period_end);
create index if not exists bookings_payout_id_idx on public.bookings (payout_id) where payout_id is not null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'paid_amount_minor'
  ) then
    execute 'update public.bookings
      set amount_paid_cents = coalesce(amount_paid_cents, paid_amount_minor::integer),
          total_paid_cents = coalesce(total_paid_cents, paid_amount_minor::integer)
      where paid_amount_minor is not null
        and (amount_paid_cents is null or total_paid_cents is null)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'price'
  ) then
    execute 'update public.bookings
      set total_paid_zar = coalesce(total_paid_zar, price)
      where total_paid_zar is null and price is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'revenue_zar'
  ) then
    execute 'update public.bookings
      set total_paid_zar = coalesce(total_paid_zar, revenue_zar::numeric)
      where total_paid_zar is null and revenue_zar is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'total_amount'
  ) then
    execute 'update public.bookings
      set total_paid_zar = coalesce(
        total_paid_zar,
        case
          when total_amount is not null and total_amount > 1000 then total_amount::numeric / 100
          when total_amount is not null then total_amount::numeric
          else null
        end
      )
      where total_paid_zar is null and total_amount is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'service_fee'
  ) then
    execute 'update public.bookings
      set service_fee_cents = coalesce(service_fee_cents, round(coalesce(service_fee, 0) * 100)::integer, 0)
      where service_fee_cents is null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'paystack_reference'
  ) then
    execute 'update public.bookings
      set is_test = true
      where paystack_reference is not null and upper(paystack_reference) like ''TEST-%''';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'payment_reference'
  ) then
    execute 'update public.bookings
      set is_test = true
      where payment_reference is not null and upper(payment_reference) like ''TEST-%''';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'paystack_ref'
  ) then
    execute 'update public.bookings
      set is_test = true
      where paystack_ref is not null and upper(paystack_ref) like ''TEST-%''';
  end if;
end $$;

update public.bookings
set amount_paid_cents = coalesce(
  amount_paid_cents,
  case when total_paid_zar is not null then round(total_paid_zar * 100)::integer else null end
)
where amount_paid_cents is null;

update public.bookings
set
  total_paid_cents = coalesce(
    total_paid_cents,
    amount_paid_cents,
    case when total_paid_zar is not null then round(total_paid_zar * 100)::integer else null end
  ),
  base_amount_cents = coalesce(
    base_amount_cents,
    greatest(
      0,
      coalesce(total_paid_cents, amount_paid_cents, case when total_paid_zar is not null then round(total_paid_zar * 100)::integer else null end, 0)
        - coalesce(service_fee_cents, 0)
    )
  ),
  extras_amount_cents = coalesce(extras_amount_cents, 0),
  cleaner_bonus_cents = coalesce(cleaner_bonus_cents, 0)
where total_paid_cents is null
   or base_amount_cents is null
   or extras_amount_cents is null
   or cleaner_bonus_cents is null;

comment on table public.cleaner_payouts is 'Weekly (or batched) cleaner pay runs; bookings link via payout_id.';
comment on column public.bookings.amount_paid_cents is 'Payment amount in minor units; retained for app compatibility.';
comment on column public.bookings.total_paid_zar is 'Customer-paid total in ZAR for app compatibility and reporting.';
comment on column public.bookings.total_paid_cents is 'Authoritative customer-paid amount in cents for payout constraints and reporting.';
comment on column public.bookings.base_amount_cents is 'Visit subtotal in cents before company-only service fee.';
comment on column public.bookings.extras_amount_cents is 'Extras subtotal in cents from checkout pricing snapshot.';
comment on column public.bookings.service_fee_cents is 'Platform fee in cents; not included in cleaner payout base.';
comment on column public.bookings.cleaner_payout_cents is 'Cleaner base payout in cents; immutable after assignment unless reassigned.';
comment on column public.bookings.cleaner_bonus_cents is 'Cleaner bonus cents when percentage share exceeds the base payout cap.';
comment on column public.bookings.company_revenue_cents is 'Platform share in cents after cleaner payout and bonus.';
comment on column public.bookings.payout_percentage is 'Applied payout percentage for hybrid model.';
comment on column public.bookings.payout_type is 'Payout model identifier.';
comment on column public.bookings.payout_id is 'Set when this completed job was included in a cleaner_payouts batch.';
comment on column public.bookings.is_test is 'Test bookings are excluded from payout batches and production financial settlement.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_cleaner_payout_cents_nonnegative'
  ) then
    alter table public.bookings
      add constraint bookings_cleaner_payout_cents_nonnegative
      check (cleaner_payout_cents is null or cleaner_payout_cents >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_cleaner_bonus_cents_nonnegative'
  ) then
    alter table public.bookings
      add constraint bookings_cleaner_bonus_cents_nonnegative
      check (cleaner_bonus_cents is null or cleaner_bonus_cents >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_company_revenue_cents_nonnegative'
  ) then
    alter table public.bookings
      add constraint bookings_company_revenue_cents_nonnegative
      check (company_revenue_cents is null or company_revenue_cents >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_total_paid_cents_nonnegative'
  ) then
    alter table public.bookings
      add constraint bookings_total_paid_cents_nonnegative
      check (total_paid_cents is null or total_paid_cents >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_extras_amount_cents_nonnegative'
  ) then
    alter table public.bookings
      add constraint bookings_extras_amount_cents_nonnegative
      check (extras_amount_cents is null or extras_amount_cents >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_cleaner_earnings_lte_total_paid'
  ) then
    alter table public.bookings
      add constraint bookings_cleaner_earnings_lte_total_paid
      check (
        cleaner_payout_cents is null
        or coalesce(cleaner_payout_cents, 0) + coalesce(cleaner_bonus_cents, 0)
          <= coalesce(total_paid_cents, amount_paid_cents, round(total_paid_zar * 100)::integer)
      ) not valid;
  end if;
end $$;
