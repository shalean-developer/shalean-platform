-- Dedicated payment recovery email queue for unpaid bookings (separate from booking_lifecycle_jobs).

create table if not exists public.booking_payment_recovery_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  customer_email text not null,
  job_type text not null check (job_type in (
    'payment_reminder_1h',
    'payment_reminder_24h',
    'booking_payment_expired'
  )),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in (
    'pending',
    'processing',
    'sent',
    'cancelled',
    'skipped',
    'failed_retryable',
    'failed_terminal'
  )),
  attempts int not null default 0,
  sent_at timestamptz,
  processed_at timestamptz,
  last_error text,
  skipped_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists booking_payment_recovery_jobs_unique_booking_type_idx
  on public.booking_payment_recovery_jobs (booking_id, job_type);

create index if not exists booking_payment_recovery_jobs_pending_due_idx
  on public.booking_payment_recovery_jobs (scheduled_for asc)
  where status in ('pending', 'failed_retryable');

create index if not exists booking_payment_recovery_jobs_failed_retry_idx
  on public.booking_payment_recovery_jobs (attempts asc)
  where status = 'failed_retryable';

create index if not exists booking_payment_recovery_jobs_customer_sent_idx
  on public.booking_payment_recovery_jobs (customer_email, sent_at desc)
  where status = 'sent';

alter table public.booking_payment_recovery_jobs enable row level security;

grant select, insert, update, delete on public.booking_payment_recovery_jobs to service_role;

comment on table public.booking_payment_recovery_jobs is
  'Payment recovery emails for unpaid bookings (reminders + expiry notice). Separate from paid-booking lifecycle emails.';
