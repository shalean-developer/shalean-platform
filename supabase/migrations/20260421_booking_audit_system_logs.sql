-- Audit hardening: operational logs, atomic user stats, idempotent booking_created events

-- ---------------------------------------------------------------------------
-- Append-only system logs (service role inserts from API routes)
-- ---------------------------------------------------------------------------
create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('error', 'warn', 'info')),
  source text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_logs_created_idx on public.system_logs (created_at desc);
create index if not exists system_logs_source_created_idx on public.system_logs (source, created_at desc);

alter table public.system_logs enable row level security;

-- ---------------------------------------------------------------------------
-- Atomic increment for user_profiles (avoids lost updates under concurrency)
-- ---------------------------------------------------------------------------
create or replace function public.increment_user_profile_stats(p_user_id uuid, p_amount_cents bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, booking_count, total_spent_cents, updated_at)
  values (p_user_id, 1, p_amount_cents, now())
  on conflict (id) do update set
    booking_count = user_profiles.booking_count + 1,
    total_spent_cents = user_profiles.total_spent_cents + excluded.total_spent_cents,
    updated_at = now();
end;
$$;

-- Service role (used by server) can execute; omit public/grants on anon.
grant execute on function public.increment_user_profile_stats(uuid, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- At most one booking_created event per booking (idempotent side effects)
-- ---------------------------------------------------------------------------
create unique index if not exists user_events_one_booking_created_per_booking
  on public.user_events (booking_id)
  where event_type = 'booking_created' and booking_id is not null;
