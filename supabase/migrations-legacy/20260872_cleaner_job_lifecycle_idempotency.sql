-- Dedupes cleaner lifecycle POSTs (retries, offline replay, lost responses).

create table if not exists public.cleaner_job_lifecycle_idempotency (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  idempotency_key text not null,
  action text not null,
  created_at timestamptz not null default now(),
  constraint cleaner_job_lifecycle_idempotency_key_uidx unique (idempotency_key)
);

comment on table public.cleaner_job_lifecycle_idempotency is
  'Claims idempotency keys for POST /api/cleaner/jobs/:id lifecycle actions; unique key prevents double application.';

create index if not exists cleaner_job_lifecycle_idempotency_booking_idx
  on public.cleaner_job_lifecycle_idempotency (booking_id, created_at desc);

create index if not exists cleaner_job_lifecycle_idempotency_cleaner_idx
  on public.cleaner_job_lifecycle_idempotency (cleaner_id, created_at desc);
