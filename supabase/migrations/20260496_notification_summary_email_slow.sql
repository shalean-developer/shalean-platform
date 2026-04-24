-- Extend notification_system_logs_summary for email + slow_notification sources.

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
        'sla_breach_sent',
        'email_sent',
        'email_failed',
        'slow_notification'
      )
    group by source
  ) s;
$$;

comment on function public.notification_system_logs_summary(int) is
  'Counts by source for the last p_days (1–90): delivery, email, and slow_notification pipeline rows.';
