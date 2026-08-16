-- CR-11: replace the Office Ops Health 10k raw cron history scan with a tiny daily aggregate.
-- The dashboard needs only day-level booking-engine success/error presence for its 30-day uptime strip.

create or replace function public.office_ops_booking_cron_daily_status(
  p_since timestamptz default (now() - interval '30 days')
)
returns table (
  created_at timestamptz,
  status text,
  message text,
  job_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    max(cr.created_at) as created_at,
    lower(cr.status)::text as status,
    null::text as message,
    cr.job_name
  from public.cron_runs cr
  where cr.created_at >= coalesce(p_since, now() - interval '30 days')
    and lower(coalesce(cr.status, '')) in ('success', 'error')
    and cr.job_name in (
      'generate-recurring-bookings',
      'charge-recurring-bookings',
      'charge-monthly-invoices',
      'booking-lifecycle',
      'retry-failed-jobs'
    )
  group by (cr.created_at at time zone 'Africa/Johannesburg')::date, cr.job_name, lower(cr.status)
  order by max(cr.created_at) desc, cr.job_name, lower(cr.status);
$$;

revoke all on function public.office_ops_booking_cron_daily_status(timestamptz) from public;
revoke all on function public.office_ops_booking_cron_daily_status(timestamptz) from anon;
revoke all on function public.office_ops_booking_cron_daily_status(timestamptz) from authenticated;
grant execute on function public.office_ops_booking_cron_daily_status(timestamptz) to service_role;
