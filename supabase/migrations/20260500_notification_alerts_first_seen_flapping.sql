-- first_fired_at: incident start; fired_at remains "last seen" on grouped updates.
-- is_flapping: set on insert when same type was resolved recently (unstable signal).

alter table public.notification_alerts
  add column if not exists first_fired_at timestamptz;

alter table public.notification_alerts
  add column if not exists is_flapping boolean not null default false;

update public.notification_alerts
  set first_fired_at = coalesce(first_fired_at, fired_at)
  where first_fired_at is null;

comment on column public.notification_alerts.first_fired_at is
  'When this incident was first observed; fired_at updates on each grouped recurrence.';

comment on column public.notification_alerts.is_flapping is
  'True when this row opened shortly after a prior same-type alert was resolved (churn).';
