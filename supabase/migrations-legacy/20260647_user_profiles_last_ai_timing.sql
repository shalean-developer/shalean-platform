-- Cooldown for AI send-timing optimization (24h per user, Phase 8 final).

alter table public.user_profiles
  add column if not exists last_ai_timing_applied_at timestamptz;

comment on column public.user_profiles.last_ai_timing_applied_at is
  'Set when a non-zero AI send delay is applied; suppresses re-optimization for 24h.';

create index if not exists user_profiles_last_ai_timing_idx
  on public.user_profiles (last_ai_timing_applied_at desc nulls last)
  where last_ai_timing_applied_at is not null;
