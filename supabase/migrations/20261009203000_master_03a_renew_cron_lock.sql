-- MASTER-03A: renewable cron lease for long-running payout catch-up.
-- Owner-only renewal: only the current unexpired holder may extend its own lease.

create or replace function public.renew_cron_lock(
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
  v_changed int;
begin
  if p_job_name is null or btrim(p_job_name) = '' or p_holder_id is null then
    return false;
  end if;

  update public.cron_run_leases
  set expires_at = v_now + make_interval(secs => v_lease_seconds)
  where job_name = p_job_name
    and holder_id = p_holder_id
    and expires_at > v_now;

  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

revoke all on function public.renew_cron_lock(text, uuid, int) from public;
revoke all on function public.renew_cron_lock(text, uuid, int) from anon;
revoke all on function public.renew_cron_lock(text, uuid, int) from authenticated;
grant execute on function public.renew_cron_lock(text, uuid, int) to service_role;

comment on function public.renew_cron_lock(text, uuid, int) is
  'MASTER-03A: owner-checked cron lease renewal. Extends only an unexpired lease held by the same holder.';
