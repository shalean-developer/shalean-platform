-- Audit trail for admin-driven earnings repair (fix / reset).

create table if not exists public.admin_earnings_actions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  action text not null check (action in ('fix', 'reset')),
  admin_user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_earnings_actions_booking_idx
  on public.admin_earnings_actions (booking_id, created_at desc);

create index if not exists admin_earnings_actions_admin_idx
  on public.admin_earnings_actions (admin_user_id, created_at desc);

comment on table public.admin_earnings_actions is
  'Admin POST /fix-earnings and /reset-earnings; no booking mutation beyond logging.';

alter table public.admin_earnings_actions enable row level security;

revoke all on public.admin_earnings_actions from public;
grant all on public.admin_earnings_actions to service_role;
