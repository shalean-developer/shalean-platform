select 'cron_targets' as probe,
  singleton,
  case when app_base_url is null or app_base_url = '' then null
       else split_part(replace(replace(app_base_url,'https://',''),'http://',''),'/',1) end as app_host,
  case when edge_base_url is null or edge_base_url = '' then null
       else split_part(replace(replace(edge_base_url,'https://',''),'http://',''),'/',1) end as edge_host,
  updated_at
from public.cron_http_targets;

select jobname, schedule, active
from cron.job
where jobname in (
  'charge-monthly-invoices',
  'send-invoice-reminders',
  'mark-monthly-invoices-overdue',
  'repair-monthly-payment-state-drift',
  'accounting-sync',
  'generate-recurring-bookings',
  'payment-recovery'
)
order by jobname;
