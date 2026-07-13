-- Fast dashboard aggregation for routing decisions (avoid JSON extraction at scale).

alter table public.notification_logs
  add column if not exists decision text;

update public.notification_logs
set decision = nullif(payload->>'decision', '')
where decision is null
  and payload ? 'decision';

create index if not exists notification_logs_decision_created_at_idx
  on public.notification_logs (decision, created_at desc)
  where decision is not null;

comment on column public.notification_logs.decision is
  'Indexed copy of payload.decision for dashboard analytics and routing optimization.';
