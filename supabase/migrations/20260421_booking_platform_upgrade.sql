-- Booking platform: user value tracking, lifecycle automation, events
-- Apply via Supabase SQL editor or supabase db push.

-- ---------------------------------------------------------------------------
-- User profiles (stats mirror; auth.users remains source of identity)
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  booking_count integer not null default 0 check (booking_count >= 0),
  total_spent_cents bigint not null default 0 check (total_spent_cents >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_updated_idx on public.user_profiles (updated_at desc);

alter table public.user_profiles enable row level security;

-- ---------------------------------------------------------------------------
-- User events (analytics + lifecycle)
-- ---------------------------------------------------------------------------
create table if not exists public.user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_type text not null check (event_type in ('booking_created', 'booking_completed')),
  booking_id uuid references public.bookings (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_events_booking_idx on public.user_events (booking_id);
create index if not exists user_events_user_created_idx on public.user_events (user_id, created_at desc);
create index if not exists user_events_type_idx on public.user_events (event_type, created_at desc);

alter table public.user_events enable row level security;

-- ---------------------------------------------------------------------------
-- Scheduled lifecycle emails (processed by /api/cron/booking-lifecycle)
-- ---------------------------------------------------------------------------
create table if not exists public.booking_lifecycle_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  customer_email text not null,
  job_type text not null check (job_type in ('review_request', 'book_again_reminder', 'promo_email')),
  run_at timestamptz not null,
  sent_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists booking_lifecycle_jobs_due_idx
  on public.booking_lifecycle_jobs (run_at asc)
  where sent_at is null;

create unique index if not exists booking_lifecycle_jobs_unique_booking_type_idx
  on public.booking_lifecycle_jobs (booking_id, job_type);

alter table public.booking_lifecycle_jobs enable row level security;
