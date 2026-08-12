-- P0-04E: server-only challenges for privileged Office email verification.
create table if not exists public.office_email_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  sent_at timestamptz not null default now(),
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_office_email_verification_user_sent
  on public.office_email_verification_challenges (user_id, sent_at desc);

alter table public.office_email_verification_challenges enable row level security;

-- This table is intentionally service-role only. Ordinary authenticated users
-- must never be able to read code hashes, attempts, or challenge metadata.
revoke all on table public.office_email_verification_challenges from anon, authenticated;
