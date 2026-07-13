-- Hardening: taxonomy version, WhatsApp snapshot, resolution, idempotency keys.

alter table public.cleaner_job_issue_reports
  add column if not exists reason_version text not null default 'v1',
  add column if not exists whatsapp_snapshot jsonb,
  add column if not exists idempotency_key text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text;

comment on column public.cleaner_job_issue_reports.reason_version is 'Taxonomy version for reason_key / labels (e.g. v1).';
comment on column public.cleaner_job_issue_reports.whatsapp_snapshot is 'Ops WhatsApp prefill payload at submit time.';
comment on column public.cleaner_job_issue_reports.resolved_at is 'When an admin marked the report resolved.';

-- Idempotency-Key header: same cleaner+booking+hash within TTL replays prior report_id.
create table if not exists public.cleaner_job_issue_report_idempotency (
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  key_hash text not null,
  report_id uuid not null references public.cleaner_job_issue_reports (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (cleaner_id, booking_id, key_hash)
);

create index if not exists cleaner_job_issue_report_idem_expires_idx
  on public.cleaner_job_issue_report_idempotency (expires_at);

comment on table public.cleaner_job_issue_report_idempotency is
  'Short-lived mapping from Idempotency-Key to created report; service role only.';

alter table public.cleaner_job_issue_report_idempotency enable row level security;

-- RLS: no grants to anon/authenticated on these tables; only service_role (Next.js server) reads/writes.
-- Admin UI uses Bearer admin JWT → Next /api/admin/* → service_role (not direct browser → Postgres).
