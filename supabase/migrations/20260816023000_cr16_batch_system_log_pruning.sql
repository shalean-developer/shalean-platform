-- CR-16: make system_logs retention pruning bounded and timeout-safe.
-- Keep the existing 30-day default retention policy, but delete in small indexed batches.

create or replace function public.prune_system_logs_batch(
  p_retention_days integer default 30,
  p_batch_size integer default 5000
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint := 0;
  v_days integer := greatest(1, least(coalesce(p_retention_days, 30), 365));
  v_batch integer := greatest(100, least(coalesce(p_batch_size, 5000), 10000));
begin
  with doomed as (
    select id
    from public.system_logs
    where created_at < now() - make_interval(days => v_days)
    order by created_at asc
    limit v_batch
  )
  delete from public.system_logs as logs
  using doomed
  where logs.id = doomed.id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_system_logs_batch(integer, integer) from public;
revoke all on function public.prune_system_logs_batch(integer, integer) from anon;
revoke all on function public.prune_system_logs_batch(integer, integer) from authenticated;
grant execute on function public.prune_system_logs_batch(integer, integer) to service_role;

-- Drain the historical backlog gradually and keep future retention current.
select cron.unschedule(jobid)
from cron.job
where jobname = 'prune-system-logs';

select cron.schedule(
  'prune-system-logs',
  '0 4 * * *',
  $$select public.invoke_nextjs_cron('/api/cron/prune-system-logs');$$
);
