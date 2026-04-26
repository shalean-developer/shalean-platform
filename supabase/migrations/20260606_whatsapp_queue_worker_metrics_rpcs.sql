-- Worker pick + status metrics via SQL (avoids PostgREST `or` / encoding edge cases).
-- `max_delivery_attempts` must stay aligned with MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS in apps/web/lib/whatsapp/queue.ts

create or replace function public.get_pending_whatsapp_jobs(limit_count integer, max_delivery_attempts integer default 5)
returns setof public.whatsapp_queue
language sql
stable
set search_path = public
as $$
  select *
  from public.whatsapp_queue
  where status = 'pending'
    and attempts < max_delivery_attempts
    and (next_attempt_at is null or next_attempt_at <= now())
  order by priority desc nulls last, created_at asc
  limit greatest(1, least(coalesce(limit_count, 15), 50));
$$;

comment on function public.get_pending_whatsapp_jobs(integer, integer) is
  'Returns eligible pending WhatsApp queue rows for the cron worker (priority, backoff).';

create or replace function public.get_whatsapp_queue_status_metrics()
returns jsonb
language sql
stable
set search_path = public
as $$
  with agg as (
    select status::text as st, count(*)::bigint as cnt
    from public.whatsapp_queue
    group by status
  )
  select jsonb_build_object(
    'pending', coalesce((select cnt from agg where st = 'pending'), 0),
    'processing', coalesce((select cnt from agg where st = 'processing'), 0),
    'sent', coalesce((select cnt from agg where st = 'sent'), 0),
    'failed', coalesce((select cnt from agg where st = 'failed'), 0),
    'dead', coalesce((select cnt from agg where st = 'dead'), 0),
    'pending_retry', (
      select count(*)::bigint
      from public.whatsapp_queue
      where status = 'pending' and attempts > 0
    )
  );
$$;

comment on function public.get_whatsapp_queue_status_metrics() is
  'Single-query queue depth: counts by status plus pending_retry (pending with attempts > 0).';

revoke all on function public.get_pending_whatsapp_jobs(integer, integer) from PUBLIC;
revoke all on function public.get_whatsapp_queue_status_metrics() from PUBLIC;

grant execute on function public.get_pending_whatsapp_jobs(integer, integer) to service_role;
grant execute on function public.get_whatsapp_queue_status_metrics() to service_role;
