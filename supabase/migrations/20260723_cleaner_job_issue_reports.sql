-- In-field problem reports from cleaners (admin booking view + ops logs).

create table if not exists public.cleaner_job_issue_reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  cleaner_id uuid not null references public.cleaners (id) on delete restrict,
  reason_key text not null,
  detail text,
  created_at timestamptz not null default now(),
  constraint cleaner_job_issue_reports_reason_key_len check (
    char_length(reason_key) >= 1
    and char_length(reason_key) <= 64
  ),
  constraint cleaner_job_issue_reports_detail_len check (
    detail is null
    or char_length(detail) <= 2000
  )
);

create index if not exists cleaner_job_issue_reports_booking_created_idx
  on public.cleaner_job_issue_reports (booking_id, created_at desc);

create index if not exists cleaner_job_issue_reports_cleaner_created_idx
  on public.cleaner_job_issue_reports (cleaner_id, created_at desc);

comment on table public.cleaner_job_issue_reports is
  'Cleaner-submitted on-site issues; written via service role from Next API.';

alter table public.cleaner_job_issue_reports enable row level security;
