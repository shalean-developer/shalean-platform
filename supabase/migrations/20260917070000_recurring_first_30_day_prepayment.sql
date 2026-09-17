-- First-30-day recurring prepayment ledger.
-- Prepared only: application requires an explicit governed database-change gate.

create table if not exists public.recurring_prepaid_packages (
  id uuid primary key default gen_random_uuid(),
  source_booking_id uuid not null unique references public.bookings(id) on delete restrict,
  recurring_id uuid null references public.recurring_bookings(id) on delete restrict,
  customer_id uuid not null,
  paystack_reference text not null unique,
  currency text not null default 'ZAR' check (currency = 'ZAR'),
  coverage_start_date date not null,
  coverage_end_date date not null,
  occurrence_dates date[] not null,
  visit_count integer not null check (visit_count > 0),
  per_visit_price_zar integer not null check (per_visit_price_zar >= 0),
  gross_package_zar integer not null check (gross_package_zar >= 0),
  paid_package_zar integer not null check (paid_package_zar >= 0),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'active', 'exhausted', 'partially_refunded', 'refunded', 'cancelled')),
  payment_completed_at timestamptz null,
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coverage_end_date >= coverage_start_date),
  check (cardinality(occurrence_dates) = visit_count),
  check (paid_package_zar <= gross_package_zar)
);

create table if not exists public.recurring_prepaid_allocations (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.recurring_prepaid_packages(id) on delete restrict,
  booking_id uuid null unique references public.bookings(id) on delete restrict,
  occurrence_date date not null,
  allocated_zar integer not null check (allocated_zar >= 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'applied', 'refunded', 'cancelled')),
  applied_at timestamptz null,
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, occurrence_date)
);

create index if not exists recurring_prepaid_packages_customer_idx
  on public.recurring_prepaid_packages(customer_id, created_at desc);
create index if not exists recurring_prepaid_packages_recurring_idx
  on public.recurring_prepaid_packages(recurring_id)
  where recurring_id is not null;
create index if not exists recurring_prepaid_allocations_lookup_idx
  on public.recurring_prepaid_allocations(package_id, occurrence_date, status);

alter table public.recurring_prepaid_packages enable row level security;
alter table public.recurring_prepaid_allocations enable row level security;

revoke all on table public.recurring_prepaid_packages from anon, authenticated;
revoke all on table public.recurring_prepaid_allocations from anon, authenticated;
grant all on table public.recurring_prepaid_packages to service_role;
grant all on table public.recurring_prepaid_allocations to service_role;

comment on table public.recurring_prepaid_packages is
  'Aggregate Paystack charge for exact recurring occurrences in the first 30 days; per-visit economics remain on bookings.';
comment on table public.recurring_prepaid_allocations is
  'Append-oriented allocation evidence linking one recurring package charge to covered visit bookings.';
