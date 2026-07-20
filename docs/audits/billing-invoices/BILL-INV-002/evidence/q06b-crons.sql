select 'cron_latest_billing' as probe, job_name, status, created_at, left(coalesce(message,''), 120) as message_prefix
from (
  select distinct on (job_name)
    job_name, status, created_at, message
  from public.cron_runs
  where job_name in (
    'charge-monthly-invoices',
    'finalize-monthly-invoices',
    'send-invoice-reminders',
    'mark-monthly-invoices-overdue',
    'accounting-sync',
    'repair-monthly-payment-state-drift',
    'generate-recurring-bookings'
  )
  order by job_name, created_at desc nulls last
) t
order by job_name;
