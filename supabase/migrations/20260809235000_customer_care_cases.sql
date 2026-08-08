-- P4 Customer Service Recovery: canonical customer-care case ledger.

create table if not exists public.customer_care_cases (
  id uuid primary key default gen_random_uuid(),
  case_number bigint generated always as identity unique,
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid references auth.users(id) on delete set null,
  customer_email text,
  customer_phone text,
  category text not null check (category in ('complaint','service_quality','damage','late_arrival','no_show','billing','refund','reschedule','communication','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'open' check (status in ('open','investigating','waiting_customer','waiting_internal','resolved','closed')),
  subject text not null check (char_length(trim(subject)) between 3 and 200),
  description text not null check (char_length(trim(description)) between 3 and 10000),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  first_response_due_at timestamptz not null,
  resolution_due_at timestamptz not null,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_summary text,
  refund_accounting_id uuid references public.refund_accounting_records(id) on delete set null,
  credit_amount_cents bigint check (credit_amount_cents is null or credit_amount_cents >= 0),
  evidence jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (resolved_at is null or status in ('resolved','closed')),
  check (closed_at is null or status = 'closed')
);

create index if not exists customer_care_cases_status_sla_idx
  on public.customer_care_cases(status, resolution_due_at);
create index if not exists customer_care_cases_booking_idx
  on public.customer_care_cases(booking_id, created_at desc);
create index if not exists customer_care_cases_customer_idx
  on public.customer_care_cases(customer_id, created_at desc);
create index if not exists customer_care_cases_assignee_idx
  on public.customer_care_cases(assigned_to, status, resolution_due_at);

create table if not exists public.customer_care_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.customer_care_cases(id) on delete cascade,
  event_type text not null check (event_type in ('created','note','status_changed','assigned','customer_contacted','evidence_added','refund_linked','credit_recorded','resolved','closed','reopened')),
  actor_user_id uuid references auth.users(id) on delete set null,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists customer_care_case_events_case_idx
  on public.customer_care_case_events(case_id, created_at);

alter table public.customer_care_cases enable row level security;
alter table public.customer_care_case_events enable row level security;
revoke all on public.customer_care_cases from anon, authenticated;
revoke all on public.customer_care_case_events from anon, authenticated;
grant all on public.customer_care_cases to service_role;
grant all on public.customer_care_case_events to service_role;

comment on table public.customer_care_cases is 'Canonical customer complaint/service-recovery case ledger with booking/customer linkage, SLA ownership, evidence, financial remedy references, resolution and closure.';
comment on table public.customer_care_case_events is 'Append-only timeline for customer-care case actions and state changes.';
