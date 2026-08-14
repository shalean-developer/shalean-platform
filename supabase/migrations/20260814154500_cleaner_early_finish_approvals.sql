create table if not exists public.cleaner_early_finish_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  cleaner_id uuid not null references public.cleaners(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','customer_approved','customer_rejected','admin_approved','cancelled')),
  approval_token uuid not null default gen_random_uuid() unique,
  requested_at timestamptz not null default now(),
  customer_responded_at timestamptz,
  customer_response text,
  approved_at timestamptz,
  approved_by text,
  approval_source text check (approval_source in ('customer','admin','supervisor','manager')),
  quoted_duration_minutes integer,
  elapsed_minutes_at_request integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cleaner_early_finish_requests_booking_idx
  on public.cleaner_early_finish_requests (booking_id, requested_at desc);
create index if not exists cleaner_early_finish_requests_status_idx
  on public.cleaner_early_finish_requests (status, requested_at desc);

alter table public.cleaner_early_finish_requests enable row level security;
revoke all on public.cleaner_early_finish_requests from anon, authenticated;
grant all on public.cleaner_early_finish_requests to service_role;

comment on table public.cleaner_early_finish_requests is
  'Audit trail for cleaner early-finish requests and customer/admin approvals used to bypass the minimum-duration completion gate.';