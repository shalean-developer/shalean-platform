-- MASTER-01A-07: bind privileged Office email-code challenges to the login session.
alter table public.office_email_verification_challenges
  add column if not exists session_binding text null;

create index if not exists idx_office_email_verification_user_session_sent
  on public.office_email_verification_challenges (user_id, session_binding, sent_at desc);
