-- Automated lifecycle emails: pending/sent/failed, scheduled_for, attempts, idempotent sends

-- ---------------------------------------------------------------------------
-- New columns (backward-compatible with existing run_at rows)
-- One ADD per statement — avoids parser issues in some SQL runners.
-- ---------------------------------------------------------------------------
alter table public.booking_lifecycle_jobs add column if not exists scheduled_for timestamptz;

alter table public.booking_lifecycle_jobs add column if not exists status text not null default 'pending';

alter table public.booking_lifecycle_jobs add column if not exists attempts int not null default 0;

alter table public.booking_lifecycle_jobs add column if not exists last_error text;

-- Backfill from legacy column (only if run_at still exists)
do $mig$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'booking_lifecycle_jobs' and column_name = 'run_at'
  ) then
    update public.booking_lifecycle_jobs
    set scheduled_for = run_at
    where scheduled_for is null and run_at is not null;
  end if;
end $mig$;

-- Rows that only have scheduled_for missing: use created_at
update public.booking_lifecycle_jobs
set scheduled_for = created_at
where scheduled_for is null;

update public.booking_lifecycle_jobs
set status = 'sent'
where sent_at is not null and status = 'pending';

-- Remove legacy job kinds (replaced by reminder_24h / rebook_offer)
delete from public.booking_lifecycle_jobs
where job_type in ('book_again_reminder', 'promo_email');

alter table public.booking_lifecycle_jobs drop constraint if exists booking_lifecycle_jobs_job_type_check;

alter table public.booking_lifecycle_jobs
  add constraint booking_lifecycle_jobs_job_type_check
  check (job_type in ('reminder_24h', 'review_request', 'rebook_offer'));

alter table public.booking_lifecycle_jobs drop constraint if exists booking_lifecycle_jobs_status_check;

alter table public.booking_lifecycle_jobs
  add constraint booking_lifecycle_jobs_status_check
  check (status in ('pending', 'sent', 'failed'));

alter table public.booking_lifecycle_jobs
  alter column scheduled_for set not null;

alter table public.booking_lifecycle_jobs drop column if exists run_at;

drop index if exists public.booking_lifecycle_jobs_due_idx;

create index if not exists booking_lifecycle_jobs_status_scheduled_idx
  on public.booking_lifecycle_jobs (status, scheduled_for asc);

create index if not exists booking_lifecycle_jobs_pending_due_idx
  on public.booking_lifecycle_jobs (scheduled_for asc)
  where status = 'pending';

create index if not exists booking_lifecycle_jobs_failed_retry_idx
  on public.booking_lifecycle_jobs (attempts asc)
  where status = 'failed';
