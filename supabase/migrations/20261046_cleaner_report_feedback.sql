-- Cleaner anonymous reports and identifiable feedback submissions.

create table if not exists public.cleaner_report_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_type text not null
    check (submission_type in ('report', 'feedback')),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  subject text,
  message text not null,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'closed')),
  admin_response text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  reviewed_by uuid,
  reviewed_by_email text,
  reviewed_at timestamptz,
  resolved_by uuid,
  resolved_by_email text,
  constraint cleaner_report_feedback_message_len check (char_length(trim(message)) >= 10),
  constraint cleaner_report_feedback_subject_len check (subject is null or char_length(trim(subject)) <= 120)
);

create index if not exists cleaner_report_feedback_type_status_created_idx
  on public.cleaner_report_feedback (submission_type, status, created_at desc);

create index if not exists cleaner_report_feedback_cleaner_created_idx
  on public.cleaner_report_feedback (cleaner_id, created_at desc);

comment on table public.cleaner_report_feedback is
  'Cleaner reports (anonymous to admins) and feedback (identity visible to admins). cleaner_id is stored for abuse prevention but must not be exposed for report rows in admin APIs.';

comment on column public.cleaner_report_feedback.submission_type is
  'report = anonymous to ops; feedback = cleaner identity shown to admins.';

alter table public.cleaner_report_feedback enable row level security;

drop policy if exists cleaner_report_feedback_select_own on public.cleaner_report_feedback;
create policy cleaner_report_feedback_select_own on public.cleaner_report_feedback
  for select to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_report_feedback.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

revoke all on public.cleaner_report_feedback from public;
grant select on public.cleaner_report_feedback to authenticated;
grant all on public.cleaner_report_feedback to service_role;
