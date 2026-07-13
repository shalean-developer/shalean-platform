-- Age out idempotency claim rows so the table stays bounded (retries/offline keys).

create or replace function public.prune_cleaner_job_lifecycle_idempotency()
returns bigint
language sql
security definer
set search_path = public
as $$
  with d as (
    delete from public.cleaner_job_lifecycle_idempotency
    where created_at < now() - interval '48 hours'
    returning 1
  )
  select coalesce(count(*)::bigint, 0) from d;
$$;

comment on function public.prune_cleaner_job_lifecycle_idempotency() is
  'Deletes idempotency claim rows older than 48h. Safe after actions are durable on bookings.';

revoke all on function public.prune_cleaner_job_lifecycle_idempotency() from public;
grant execute on function public.prune_cleaner_job_lifecycle_idempotency() to service_role;

-- Daily prune when pg_cron exists (idempotent job name).
do $$
declare
  j record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  for j in
    select jobid
      from cron.job
     where jobname = 'prune-cleaner-job-lifecycle-idempotency'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule(
    'prune-cleaner-job-lifecycle-idempotency',
    '13 4 * * *',
    'select public.prune_cleaner_job_lifecycle_idempotency();'
  );
end
$$;
