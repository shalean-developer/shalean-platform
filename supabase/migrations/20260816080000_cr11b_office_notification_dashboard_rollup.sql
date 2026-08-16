-- CR-11B: aggregate Office Notifications dashboard counters in Postgres instead of transferring
-- up to 20k notification rows and 10k booking-email rows to the Next.js route.

create or replace function public.office_notifications_dashboard_rollup(
  p_since timestamptz
)
returns table (
  all_customers bigint,
  email_sent bigint,
  email_failed bigint,
  whatsapp_sent bigint,
  whatsapp_failed bigint,
  sms_sent bigint,
  sms_failed bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with audience as (
    select count(distinct lower(trim(b.customer_email)))::bigint as all_customers
    from public.bookings b
    where b.customer_email is not null
      and trim(b.customer_email) <> ''
  ),
  notification_counts as (
    select
      count(*) filter (where lower(n.channel) = 'email' and lower(n.status) = 'sent')::bigint as email_sent,
      count(*) filter (where lower(n.channel) = 'email' and lower(n.status) = 'failed')::bigint as email_failed,
      count(*) filter (where lower(n.channel) = 'whatsapp' and lower(n.status) = 'sent')::bigint as whatsapp_sent,
      count(*) filter (where lower(n.channel) = 'whatsapp' and lower(n.status) = 'failed')::bigint as whatsapp_failed,
      count(*) filter (where lower(n.channel) = 'sms' and lower(n.status) = 'sent')::bigint as sms_sent,
      count(*) filter (where lower(n.channel) = 'sms' and lower(n.status) = 'failed')::bigint as sms_failed
    from public.notification_logs n
    where n.created_at >= p_since
  )
  select
    a.all_customers,
    nc.email_sent,
    nc.email_failed,
    nc.whatsapp_sent,
    nc.whatsapp_failed,
    nc.sms_sent,
    nc.sms_failed
  from audience a
  cross join notification_counts nc;
$$;

revoke all on function public.office_notifications_dashboard_rollup(timestamptz) from public;
revoke all on function public.office_notifications_dashboard_rollup(timestamptz) from anon;
revoke all on function public.office_notifications_dashboard_rollup(timestamptz) from authenticated;
grant execute on function public.office_notifications_dashboard_rollup(timestamptz) to service_role;
