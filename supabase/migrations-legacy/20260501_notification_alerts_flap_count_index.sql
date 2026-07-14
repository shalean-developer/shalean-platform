-- Track repeat churn within one open flapping incident; index for flapping rows.

alter table public.notification_alerts
  add column if not exists flap_count integer not null default 0;

comment on column public.notification_alerts.flap_count is
  'Increments on each grouped recurrence while the row was opened as flapping (is_flapping true).';

create index if not exists notification_alerts_flapping_type_resolved_idx
  on public.notification_alerts (type, resolved_at desc)
  where is_flapping = true;

-- Speeds flap probe: same type + recently resolved.
create index if not exists notification_alerts_type_resolved_at_idx
  on public.notification_alerts (type, resolved_at desc)
  where resolved_at is not null;
