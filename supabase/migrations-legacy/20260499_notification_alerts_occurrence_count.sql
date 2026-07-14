-- Group repeated fires (occurrence_count). Also bootstraps the table if 20260498 was skipped or not applied yet.

create table if not exists public.notification_alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  severity text not null check (severity in ('warn', 'error', 'critical')),
  fired_at timestamptz not null default now(),
  resolved_at timestamptz null,
  context jsonb not null default '{}'::jsonb
);

alter table public.notification_alerts
  add column if not exists occurrence_count integer not null default 1;

comment on column public.notification_alerts.occurrence_count is
  'Increments when the same alert type fires again while still unresolved.';

create index if not exists notification_alerts_fired_idx
  on public.notification_alerts (fired_at desc);

create index if not exists notification_alerts_open_type_idx
  on public.notification_alerts (type, fired_at desc)
  where resolved_at is null;

comment on table public.notification_alerts is
  'Notification metric alerts (type = alert key). resolved_at set when ops marks cleared or metrics recover.';

alter table public.notification_alerts enable row level security;

grant select, insert, update, delete on public.notification_alerts to service_role;
