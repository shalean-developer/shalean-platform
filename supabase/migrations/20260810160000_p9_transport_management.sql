-- P9 transport: vehicles, drivers, booking-linked routes and auditable costs.

create table if not exists public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  registration text not null unique,
  make text not null,
  model text not null,
  year integer null check (year is null or year between 1990 and 2100),
  status text not null default 'active' check (status in ('active','maintenance','inactive')),
  seats integer not null default 4 check (seats > 0),
  odometer_km numeric(12,1) not null default 0 check (odometer_km >= 0),
  service_due_km numeric(12,1) null check (service_due_km is null or service_due_km >= 0),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_drivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  cleaner_id uuid null unique references public.cleaners(id) on delete set null,
  licence_number text null,
  licence_expires_at date null,
  is_active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_runs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete restrict,
  driver_id uuid not null references public.transport_drivers(id) on delete restrict,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','cancelled')),
  scheduled_at timestamptz not null,
  started_at timestamptz null,
  completed_at timestamptz null,
  origin text not null,
  destination text not null,
  odometer_start_km numeric(12,1) null check (odometer_start_km is null or odometer_start_km >= 0),
  odometer_end_km numeric(12,1) null check (odometer_end_km is null or odometer_end_km >= 0),
  total_km numeric(12,1) null check (total_km is null or total_km >= 0),
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (odometer_end_km is null or odometer_start_km is null or odometer_end_km >= odometer_start_km)
);

create table if not exists public.transport_stops (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.transport_runs(id) on delete cascade,
  booking_id uuid null references public.bookings(id) on delete set null,
  stop_order integer not null check (stop_order > 0),
  stop_type text not null check (stop_type in ('pickup','dropoff','booking','fuel','other')),
  address text not null,
  planned_at timestamptz null,
  arrived_at timestamptz null,
  departed_at timestamptz null,
  notes text null,
  unique (run_id, stop_order)
);

create table if not exists public.transport_cost_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.transport_runs(id) on delete cascade,
  booking_id uuid null references public.bookings(id) on delete set null,
  expense_id uuid null references public.expenses(id) on delete set null,
  cost_type text not null check (cost_type in ('fuel','parking','maintenance','toll','other')),
  amount_cents integer not null check (amount_cents > 0),
  occurred_at timestamptz not null default now(),
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists transport_runs_schedule_idx on public.transport_runs(status, scheduled_at);
create index if not exists transport_stops_booking_idx on public.transport_stops(booking_id) where booking_id is not null;
create index if not exists transport_cost_entries_run_idx on public.transport_cost_entries(run_id, occurred_at desc);
create index if not exists fleet_vehicles_service_idx on public.fleet_vehicles(status, service_due_km);

create or replace function public.complete_transport_run(
  p_run_id uuid, p_odometer_end_km numeric, p_actor uuid default null
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_run public.transport_runs%rowtype; v_start numeric(12,1); v_total numeric(12,1);
begin
  select * into v_run from public.transport_runs where id=p_run_id and status in ('planned','in_progress') for update;
  if not found then raise exception 'open transport run not found'; end if;
  select odometer_km into v_start from public.fleet_vehicles where id=v_run.vehicle_id for update;
  v_start := coalesce(v_run.odometer_start_km,v_start);
  if p_odometer_end_km is null or p_odometer_end_km < v_start then raise exception 'end odometer must not be before start'; end if;
  v_total := p_odometer_end_km-v_start;
  update public.transport_runs set status='completed',started_at=coalesce(started_at,scheduled_at),completed_at=now(),odometer_start_km=v_start,odometer_end_km=p_odometer_end_km,total_km=v_total,updated_at=now() where id=p_run_id;
  update public.fleet_vehicles set odometer_km=greatest(odometer_km,p_odometer_end_km),updated_at=now() where id=v_run.vehicle_id;
  return v_total;
end;
$$;

create or replace view public.transport_run_cost_summary with (security_invoker = true) as
select r.id as run_id, r.total_km,
  coalesce(sum(c.amount_cents),0)::bigint as total_cost_cents,
  coalesce(sum(c.amount_cents) filter (where c.cost_type='fuel'),0)::bigint as fuel_cents,
  coalesce(sum(c.amount_cents) filter (where c.cost_type='parking'),0)::bigint as parking_cents,
  coalesce(sum(c.amount_cents) filter (where c.cost_type='maintenance'),0)::bigint as maintenance_cents
from public.transport_runs r left join public.transport_cost_entries c on c.run_id=r.id
group by r.id,r.total_km;

alter table public.fleet_vehicles enable row level security;
alter table public.transport_drivers enable row level security;
alter table public.transport_runs enable row level security;
alter table public.transport_stops enable row level security;
alter table public.transport_cost_entries enable row level security;
revoke all on table public.fleet_vehicles,public.transport_drivers,public.transport_runs,public.transport_stops,public.transport_cost_entries from anon,authenticated;
revoke all on function public.complete_transport_run(uuid,numeric,uuid) from public,anon,authenticated;
grant all on table public.fleet_vehicles,public.transport_drivers,public.transport_runs,public.transport_stops,public.transport_cost_entries to service_role;
grant select on public.transport_run_cost_summary to service_role;
grant execute on function public.complete_transport_run(uuid,numeric,uuid) to service_role;

