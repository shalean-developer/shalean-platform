-- CR-11: replace the Office Ops Health 10k raw cron success scan with a tiny daily aggregate.
-- The dashboard only needs to know whether each booking-engine cron had at least one success per Johannesburg day.

create or replace function public.office_ops_booking_cron_success_days(
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
    'success'::text as status,
    null::text as message,
    cr.job_name
  from public.cron_runs cr
  where cr.created_at >= coalesce(p_since, now() - interval '30 days')
    and lower(coalesce(cr.status, '')) = 'success'
    and cr.job_name in (
      'generate-recurring-bookings',
      'charge-recurring-bookings',
      'charge-monthly-invoices',
      'booking-lifecycle',
      'retry-failed-jobs'
    )
  group by (cr.created_at at time zone 'Africa/Johannesburg')::date, cr.job_name
  order by max(cr.created_at) desc, cr.job_name;
$$;

revoke all on function public.office_ops_booking_cron_success_days(timestamptz) from public;
revoke all on function public.office_ops_booking_cron_success_days(timestamptz) from anon;
revoke all on function public.office_ops_booking_cron_success_days(timestamptz) from authenticated;
grant execute on function public.office_ops_booking_cron_success_days(timestamptz) to service_role;
