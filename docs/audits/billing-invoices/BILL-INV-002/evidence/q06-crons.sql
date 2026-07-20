select 'cron_latest_billing' as probe, job_name, status, started_at, finished_at
from (
  select distinct on (job_name)
    job_name, status, started_at, finished_at
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
  order by job_name, started_at desc nulls last
) t
order by job_name;
