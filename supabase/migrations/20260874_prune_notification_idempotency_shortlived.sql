-- Short-lived idempotency keys (SMS click buckets, magic-link jti) do not need long retention.
-- Payment / delivery claims keep longer history by only deleting matching event types.

create or replace function public.prune_short_lived_notification_idempotency_claims()
returns bigint
language sql
security definer
set search_path = public
as $$
  with d as (
    delete from public.notification_idempotency_claims
    where created_at < now() - interval '48 hours'
      and (
        event_type in ('dispatch_offer_tracked_link_open', 'cleaner_job_magic_session')
        or reference like 'sms_offer_click:%'
        or reference like 'job_magic_jti:%'
      )
    returning 1
  )
  select coalesce(count(*)::bigint, 0) from d;
$$;

comment on function public.prune_short_lived_notification_idempotency_claims() is
  'Deletes short-lived notification idempotency rows (tracked offer clicks, magic session jti) older than 48h.';

revoke all on function public.prune_short_lived_notification_idempotency_claims() from public;
grant execute on function public.prune_short_lived_notification_idempotency_claims() to service_role;

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
     where jobname = 'prune-notification-idempotency-shortlived'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule(
    'prune-notification-idempotency-shortlived',
    '7 5 * * *',
    'select public.prune_short_lived_notification_idempotency_claims();'
  );
end
$$;
