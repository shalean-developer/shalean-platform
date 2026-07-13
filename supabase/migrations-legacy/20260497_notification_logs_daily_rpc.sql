-- Daily buckets for notification monitoring chart (admin UI).

create or replace function public.notification_system_logs_daily(p_days int default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('day', day, 'source', source, 'cnt', cnt)
        order by day asc, source asc
      )
      from (
        select
          (created_at at time zone 'utc')::date::text as day,
          source,
          count(*)::bigint as cnt
        from public.system_logs
        where created_at >= now() - (greatest(1, least(coalesce(p_days, 7), 90))::text || ' days')::interval
          and source in (
            'cleaner_whatsapp_sent',
            'cleaner_whatsapp_failed',
            'cleaner_sms_fallback_used',
            'sms_fallback_sent',
            'email_sent',
            'email_failed',
            'slow_notification',
            'reminder_2h_sent',
            'assigned_sent',
            'completed_sent',
            'sla_breach_sent'
          )
        group by 1, 2
      ) s
    ),
    '[]'::jsonb
  );
$$;

comment on function public.notification_system_logs_daily(int) is
  'UTC date + source + count for notification monitoring time-series.';

grant execute on function public.notification_system_logs_daily(int) to service_role;
