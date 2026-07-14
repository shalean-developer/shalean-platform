-- Optional: TTL prune (called from app cron), analytics index, RPC for admin notification metrics.

create index if not exists idx_system_logs_source_time
  on public.system_logs (source, created_at desc);

comment on index public.idx_system_logs_source_time is
  'Speeds source + time-window scans (notification delivery dashboards, ops queries).';

-- Server cron: delete rows older than N days (default 30).
create or replace function public.prune_system_logs(p_retention_days int default 30)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
  days int := greatest(1, least(coalesce(p_retention_days, 30), 365));
begin
  with d as (
    delete from public.system_logs
    where created_at < now() - (days::text || ' days')::interval
    returning 1
  )
  select count(*) into n from d;
  return coalesce(n, 0);
end;
$$;

comment on function public.prune_system_logs(int) is
  'Deletes system_logs older than retention (1–365 days, default 30). Returns row count removed.';

grant execute on function public.prune_system_logs(int) to service_role;

-- JSON map source -> count for curated notification / delivery sources (admin dashboard seed).
create or replace function public.notification_system_logs_summary(p_days int default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(source, to_jsonb(cnt)),
    '{}'::jsonb
  )
  from (
    select source, count(*)::bigint as cnt
    from public.system_logs
    where created_at >= now() - (greatest(1, least(coalesce(p_days, 7), 90))::text || ' days')::interval
      and source in (
        'cleaner_whatsapp_sent',
        'cleaner_whatsapp_failed',
        'cleaner_sms_fallback_used',
        'sms_fallback_sent',
        'sms_fallback_disabled',
        'missing_customer_email',
        'reminder_2h_sent',
        'assigned_sent',
        'completed_sent',
        'sla_breach_sent'
      )
    group by source
  ) s;
$$;

comment on function public.notification_system_logs_summary(int) is
  'Counts by source for the last p_days (1–90, default 7) for notification pipeline observability.';

grant execute on function public.notification_system_logs_summary(int) to service_role;
