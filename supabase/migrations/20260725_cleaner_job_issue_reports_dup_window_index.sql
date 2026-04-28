-- Speeds 2-minute same-reason dedupe lookup (booking_id + cleaner_id + reason_key + recent created_at).
create index if not exists idx_issue_reports_dup_window
  on public.cleaner_job_issue_reports (booking_id, cleaner_id, reason_key, created_at desc);
