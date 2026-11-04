-- Source-only; do not apply until separate owner approval.
-- Explicit evidence for promotional email. No backfill from bookings, unsubscribed_at or past sends.
create table if not exists public.marketing_email_consent_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.user_profiles(id) on delete restrict,
  email text not null,
  purpose text not null default 'promotional_email' check (purpose = 'promotional_email'),
  decision text not null check (decision in ('granted','withdrawn')),
  source text not null,
  policy_version text not null,
  evidence_reference text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint marketing_email_consent_email_normalized check (email = lower(trim(email))),
  constraint marketing_email_consent_evidence_nonempty check (
    length(trim(source)) > 0 and length(trim(policy_version)) > 0 and length(trim(evidence_reference)) > 0
  )
);
create index if not exists marketing_email_consent_latest_idx
  on public.marketing_email_consent_events (customer_id, email, purpose, occurred_at desc, created_at desc);
alter table public.marketing_email_consent_events enable row level security;
revoke all on public.marketing_email_consent_events from anon, authenticated;
-- Service-role owned server flows only. This schema does not expose public opt-in writes.
