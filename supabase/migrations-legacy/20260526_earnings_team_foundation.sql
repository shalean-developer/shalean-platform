-- Earnings v1 + team assignments foundation (additive only).

alter table public.bookings
  add column if not exists display_earnings_cents integer,
  add column if not exists payout_earnings_cents integer,
  add column if not exists internal_earnings_cents integer,
  add column if not exists earnings_model_version text,
  add column if not exists earnings_percentage_applied numeric(5,4),
  add column if not exists earnings_cap_cents_applied integer,
  add column if not exists earnings_tenure_months_at_assignment numeric(6,2),
  add column if not exists is_team_job boolean not null default false,
  add column if not exists team_id uuid;

create table if not exists public.service_earning_caps (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  cap_cents integer not null,
  is_active boolean not null default true,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists service_earning_caps_service_id_idx
  on public.service_earning_caps (service_id);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_type text not null,
  capacity_per_day integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  cleaner_id uuid references public.cleaners(id) on delete set null,
  active_from timestamptz,
  active_to timestamptz
);

create index if not exists team_members_team_id_idx on public.team_members(team_id);
create index if not exists team_members_cleaner_id_idx on public.team_members(cleaner_id);

create table if not exists public.booking_team_assignments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  status text,
  assigned_at timestamptz not null default now()
);

create index if not exists booking_team_assignments_booking_id_idx
  on public.booking_team_assignments (booking_id);
create index if not exists booking_team_assignments_team_id_idx
  on public.booking_team_assignments (team_id);

create table if not exists public.team_job_member_payouts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  cleaner_id uuid references public.cleaners(id) on delete set null,
  payout_cents integer not null,
  status text,
  created_at timestamptz not null default now()
);

create index if not exists team_job_member_payouts_booking_id_idx
  on public.team_job_member_payouts (booking_id);
create index if not exists team_job_member_payouts_team_id_idx
  on public.team_job_member_payouts (team_id);
create index if not exists team_job_member_payouts_cleaner_id_idx
  on public.team_job_member_payouts (cleaner_id);

create table if not exists public.team_daily_capacity_usage (
  team_id uuid not null references public.teams(id) on delete cascade,
  booking_date date not null,
  used_slots integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (team_id, booking_date)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_team_id_fkey'
  ) then
    alter table public.bookings
      add constraint bookings_team_id_fkey
      foreign key (team_id) references public.teams(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_display_earnings_non_negative'
  ) then
    alter table public.bookings
      add constraint bookings_display_earnings_non_negative
      check (display_earnings_cents is null or display_earnings_cents >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_payout_earnings_non_negative'
  ) then
    alter table public.bookings
      add constraint bookings_payout_earnings_non_negative
      check (payout_earnings_cents is null or payout_earnings_cents >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_internal_earnings_non_negative'
  ) then
    alter table public.bookings
      add constraint bookings_internal_earnings_non_negative
      check (internal_earnings_cents is null or internal_earnings_cents >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'service_earning_caps_cap_cents_non_negative'
  ) then
    alter table public.service_earning_caps
      add constraint service_earning_caps_cap_cents_non_negative
      check (cap_cents >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'teams_capacity_per_day_positive'
  ) then
    alter table public.teams
      add constraint teams_capacity_per_day_positive
      check (capacity_per_day > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'team_job_member_payouts_non_negative'
  ) then
    alter table public.team_job_member_payouts
      add constraint team_job_member_payouts_non_negative
      check (payout_cents >= 0) not valid;
  end if;
end $$;

create or replace function public.claim_team_capacity_slot(
  p_team_id uuid,
  p_booking_date date,
  p_capacity_per_day integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_claim boolean := false;
begin
  insert into public.team_daily_capacity_usage (team_id, booking_date, used_slots)
  values (p_team_id, p_booking_date, 1)
  on conflict (team_id, booking_date) do update
    set used_slots = public.team_daily_capacity_usage.used_slots + 1,
        updated_at = now()
  where public.team_daily_capacity_usage.used_slots < p_capacity_per_day;

  get diagnostics did_claim = row_count;
  return did_claim;
end;
$$;

create or replace function public.release_team_capacity_slot(
  p_team_id uuid,
  p_booking_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_release boolean := false;
begin
  update public.team_daily_capacity_usage
     set used_slots = greatest(0, used_slots - 1),
         updated_at = now()
   where team_id = p_team_id
     and booking_date = p_booking_date
     and used_slots > 0;

  get diagnostics did_release = row_count;
  return did_release;
end;
$$;

comment on column public.bookings.display_earnings_cents is 'Cleaner-visible earnings amount in cents.';
comment on column public.bookings.payout_earnings_cents is 'Actual payout amount in cents used for payroll.';
comment on column public.bookings.internal_earnings_cents is 'Internal earnings amount in cents, may include hidden adjustments.';
comment on column public.bookings.earnings_model_version is 'Version string for earnings model snapshot at assignment.';
comment on column public.bookings.is_team_job is 'True when booking is fulfilled by a team, not an individual cleaner.';
comment on column public.bookings.team_id is 'Assigned team for team jobs.';
