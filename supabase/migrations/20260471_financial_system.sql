-- Financial system: weekly cleaner payouts, booking → payout link, admin pricing rules.

-- ---------------------------------------------------------------------------
-- Cleaner payouts (aggregated per cleaner per period)
-- ---------------------------------------------------------------------------
create table if not exists public.cleaner_payouts (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  total_amount_cents integer not null check (total_amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists cleaner_payouts_cleaner_id_idx on public.cleaner_payouts (cleaner_id);
create index if not exists cleaner_payouts_status_idx on public.cleaner_payouts (status);
create index if not exists cleaner_payouts_period_idx on public.cleaner_payouts (period_start, period_end);

comment on table public.cleaner_payouts is 'Weekly (or batched) cleaner pay runs; bookings link via payout_id.';

-- ---------------------------------------------------------------------------
-- Bookings → payout batch
-- ---------------------------------------------------------------------------
alter table public.bookings add column if not exists payout_id uuid references public.cleaner_payouts (id) on delete set null;

create index if not exists bookings_payout_id_idx on public.bookings (payout_id) where payout_id is not null;

comment on column public.bookings.payout_id is 'Set when this completed job was included in a cleaner_payouts batch.';

-- ---------------------------------------------------------------------------
-- Admin-configurable pricing rules (optional overrides)
-- ---------------------------------------------------------------------------
create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  location text,
  demand_level text check (demand_level is null or demand_level in ('low', 'normal', 'high')),
  base_multiplier numeric not null default 1 check (base_multiplier > 0 and base_multiplier <= 3),
  service_fee_cents integer not null default 3000 check (service_fee_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists pricing_rules_location_idx on public.pricing_rules (location);

comment on table public.pricing_rules is 'Optional multipliers/fees by location label and demand band; app merges with static maps.';

-- ---------------------------------------------------------------------------
-- RLS: cleaners read own payout rows (API still uses service role where needed)
-- ---------------------------------------------------------------------------
alter table public.cleaner_payouts enable row level security;

create policy cleaner_payouts_select_own on public.cleaner_payouts
  for select to authenticated
  using (cleaner_id = auth.uid());
