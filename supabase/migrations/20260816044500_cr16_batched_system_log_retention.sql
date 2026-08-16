-- CR-16: make system_logs retention bounded and resilient.
-- Production had >1M rows / ~845 MB and the weekly monolithic delete timed out.
-- Routine info/warn logs keep 30 days, errors keep 90 days, and audit/security/auth
-- sources keep 180 days. Each RPC removes at most p_batch_size rows.

drop function if exists public.prune_system_logs(integer);

create or replace function public.prune_system_logs(
  p_retention_days integer default 30,
  p_error_retention_days integer default 90,
  p_protected_retention_days integer default 180,
  p_batch_size integer default 5000
)
returns bigint
language plpgsql
security definer
set search_path = public
as $function$
declare
  normal_days integer := greatest(1, least(coalesce(p_retention_days, 30), 365));
  error_days integer := greatest(normal_days, least(coalesce(p_error_retention_days, 90), 730));
  protected_days integer := greatest(error_days, least(coalesce(p_protected_retention_days, 180), 1095));
  batch_size integer := greatest(100, least(coalesce(p_batch_size, 5000), 10000));
  deleted_count bigint;
begin
  with victims as (
    select id
    from public.system_logs
    where created_at < now() - (
      case
        when lower(source) ~ '(audit|security|auth|permission|rbac|login)' then protected_days
        when level = 'error' then error_days
        else normal_days
      end::text || ' days'
    )::interval
    order by created_at asc, id asc
    limit batch_size
  ), deleted as (
    delete from public.system_logs s
    using victims v
    where s.id = v.id
    returning 1
  )
  select count(*) into deleted_count from deleted;

  return coalesce(deleted_count, 0);
end;
$function$;

revoke all on function public.prune_system_logs(integer, integer, integer, integer) from public;
grant execute on function public.prune_system_logs(integer, integer, integer, integer) to service_role;

-- Daily cleanup keeps the table near its retention window after the current backlog drains.
select cron.unschedule(jobid)
from cron.job
where jobname = 'prune-system-logs';

select cron.schedule(
  'prune-system-logs',
  '0 4 * * *',
  $$select public.invoke_nextjs_cron('/api/cron/prune-system-logs');$$
);
