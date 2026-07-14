-- H-15: per-job cron concurrency leases.
--
-- Adds a `cron_run_leases` table plus two SECURITY DEFINER RPCs (`try_acquire_cron_lock`,
-- `release_cron_lock`) that financial / recurring / payout / assignment / booking cron routes
-- use via `apps/web/lib/cron/cronLock.ts` to ensure only one runner processes a protected job
-- at a time. Lease semantics (TTL + auto-expiry) make the lock crash-safe — if a runner dies,
-- the lease auto-expires after `expires_at` and the next runner can claim it.
--
-- This file is forward-only and idempotent: the table and both RPCs use IF NOT EXISTS / OR REPLACE
-- so re-applying is safe. RLS is denied to non-service_role (the RPCs are the only allowed surface).
--
-- Lock keys live in `apps/web/lib/cron/cronLockKeys.ts`. Read-only / non-mutating cron jobs
-- intentionally do NOT use this lock so they continue to run in parallel.

create table if not exists public.cron_run_leases (
  job_name text primary key,
  holder_id uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint cron_run_leases_job_name_nonempty check (char_length(btrim(job_name)) > 0),
  constraint cron_run_leases_expiry_after_acquire check (expires_at > acquired_at)
);

create index if not exists cron_run_leases_expires_at_idx
  on public.cron_run_leases (expires_at);

comment on table public.cron_run_leases is
  'H-15: per-cron-job advisory leases. One row per `job_name`; `holder_id` identifies the active runner; `expires_at` is the lease TTL. Used by withCronLock to prevent overlap between schedulers (Vercel + Supabase pg_cron).';

-- ---------------------------------------------------------------------------
-- try_acquire_cron_lock — atomic claim with auto-expiry takeover
-- ---------------------------------------------------------------------------
-- Returns true iff this caller now holds an unexpired lease for `p_job_name`.
-- If a row exists with `expires_at >= now()` the call returns false and does
-- not touch the row (the existing holder keeps its lease).
-- If no row exists, OR the existing row's lease has expired, this caller becomes
-- the new holder via INSERT ... ON CONFLICT DO UPDATE WHERE expires_at < now().
create or replace function public.try_acquire_cron_lock(
  p_job_name text,
  p_holder_id uuid,
  p_lease_seconds int default 600
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_lease_seconds int := greatest(30, least(3600, coalesce(p_lease_seconds, 600)));
  v_expires_at timestamptz := v_now + make_interval(secs => v_lease_seconds);
  v_holds boolean;
begin
  if p_job_name is null or btrim(p_job_name) = '' or p_holder_id is null then
    return false;
  end if;

  insert into public.cron_run_leases (job_name, holder_id, acquired_at, expires_at)
  values (p_job_name, p_holder_id, v_now, v_expires_at)
  on conflict (job_name) do update
    set holder_id = excluded.holder_id,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
    where public.cron_run_leases.expires_at < v_now;

  select exists (
    select 1
    from public.cron_run_leases
    where job_name = p_job_name
      and holder_id = p_holder_id
      and expires_at > v_now
  ) into v_holds;

  return coalesce(v_holds, false);
end;
$$;

comment on function public.try_acquire_cron_lock(text, uuid, int) is
  'H-15: atomic per-job cron lease claim. Returns true iff caller now holds an unexpired lease. Lease TTL clamped to [30s, 3600s].';

-- ---------------------------------------------------------------------------
-- release_cron_lock — owner-checked release
-- ---------------------------------------------------------------------------
-- Deletes the lease row only if held by `p_holder_id`. Returns true iff a row
-- was deleted. If the lease has already expired and been claimed by someone
-- else, this returns false and the new holder's lease is untouched.
create or replace function public.release_cron_lock(
  p_job_name text,
  p_holder_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted int;
begin
  if p_job_name is null or btrim(p_job_name) = '' or p_holder_id is null then
    return false;
  end if;

  delete from public.cron_run_leases
  where job_name = p_job_name
    and holder_id = p_holder_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

comment on function public.release_cron_lock(text, uuid) is
  'H-15: owner-checked cron lease release. Returns true iff a row matching (job_name, holder_id) was deleted.';

-- ---------------------------------------------------------------------------
-- RLS / GRANTs — service_role only
-- ---------------------------------------------------------------------------
alter table public.cron_run_leases enable row level security;

revoke all on public.cron_run_leases from public;
revoke all on public.cron_run_leases from authenticated;
grant all on public.cron_run_leases to service_role;

revoke all on function public.try_acquire_cron_lock(text, uuid, int) from public;
revoke all on function public.try_acquire_cron_lock(text, uuid, int) from authenticated;
grant execute on function public.try_acquire_cron_lock(text, uuid, int) to service_role;

revoke all on function public.release_cron_lock(text, uuid) from public;
revoke all on function public.release_cron_lock(text, uuid) from authenticated;
grant execute on function public.release_cron_lock(text, uuid) to service_role;
