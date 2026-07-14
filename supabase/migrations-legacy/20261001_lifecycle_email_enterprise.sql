-- Enterprise lifecycle email management: expanded status model, settings, metrics

-- ---------------------------------------------------------------------------
-- booking_lifecycle_jobs: new columns
-- ---------------------------------------------------------------------------
alter table public.booking_lifecycle_jobs add column if not exists skipped_reason text;
alter table public.booking_lifecycle_jobs add column if not exists processed_at timestamptz;

-- Backfill failed → failed_retryable | failed_terminal before constraint change
update public.booking_lifecycle_jobs
set status = 'failed_terminal'
where status = 'failed' and attempts >= 5;

update public.booking_lifecycle_jobs
set status = 'failed_retryable'
where status = 'failed' and attempts < 5;

alter table public.booking_lifecycle_jobs drop constraint if exists booking_lifecycle_jobs_status_check;

alter table public.booking_lifecycle_jobs
  add constraint booking_lifecycle_jobs_status_check
  check (status in (
    'pending',
    'processing',
    'sent',
    'cancelled',
    'skipped',
    'failed_retryable',
    'failed_terminal'
  ));

drop index if exists public.booking_lifecycle_jobs_pending_due_idx;
drop index if exists public.booking_lifecycle_jobs_failed_retry_idx;

create index if not exists booking_lifecycle_jobs_pending_due_idx
  on public.booking_lifecycle_jobs (scheduled_for asc)
  where status in ('pending', 'failed_retryable');

create index if not exists booking_lifecycle_jobs_failed_retry_idx
  on public.booking_lifecycle_jobs (attempts asc)
  where status = 'failed_retryable';

create index if not exists booking_lifecycle_jobs_customer_sent_idx
  on public.booking_lifecycle_jobs (customer_email, sent_at desc)
  where status = 'sent';

-- ---------------------------------------------------------------------------
-- lifecycle_email_settings (singleton)
-- ---------------------------------------------------------------------------
create table if not exists public.lifecycle_email_settings (
  id uuid primary key default gen_random_uuid(),
  emails_enabled boolean not null default true,
  dry_run_enabled boolean not null default false,
  frequency_limit_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.lifecycle_email_settings (emails_enabled, dry_run_enabled, frequency_limit_enabled)
select true, false, true
where not exists (select 1 from public.lifecycle_email_settings limit 1);

alter table public.lifecycle_email_settings enable row level security;

grant select, insert, update, delete on public.lifecycle_email_settings to service_role;

comment on table public.lifecycle_email_settings is
  'Singleton runtime controls for lifecycle email cron (pause, dry-run, frequency limits).';

-- ---------------------------------------------------------------------------
-- lifecycle_email_metrics (daily rollup)
-- ---------------------------------------------------------------------------
create table if not exists public.lifecycle_email_metrics (
  date date not null,
  job_type text not null,
  sent_count int not null default 0,
  failed_count int not null default 0,
  skipped_count int not null default 0,
  primary key (date, job_type)
);

alter table public.lifecycle_email_metrics enable row level security;

grant select, insert, update, delete on public.lifecycle_email_metrics to service_role;

comment on table public.lifecycle_email_metrics is
  'Daily aggregated lifecycle email outcomes by job_type for admin analytics.';
