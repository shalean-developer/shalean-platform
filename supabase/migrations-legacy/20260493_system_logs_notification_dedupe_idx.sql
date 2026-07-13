-- DB-level idempotency for notification pipeline claims (concurrent cron / webhook safe).
-- cleanerId in JSON is coalesced to '' when absent so reminder/completed/sla rows share (source, bookingId, '').
-- assigned_sent rows include cleaner_id so a new assign (different cleaner) can claim again.

-- Dedupe legacy rows so CREATE UNIQUE INDEX cannot fail.
with ranked as (
  select
    id,
    row_number() over (
      partition by
        source,
        coalesce(context->>'bookingId', ''),
        coalesce(context->>'cleanerId', '')
      order by created_at desc
    ) as rn
  from public.system_logs
  where source in (
    'reminder_2h_sent',
    'assigned_sent',
    'completed_sent',
    'sla_breach_sent'
  )
)
delete from public.system_logs s
using ranked r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists idx_notification_dedupe
  on public.system_logs (
    source,
    (context->>'bookingId'),
    coalesce(context->>'cleanerId', '')
  )
  where source in (
    'reminder_2h_sent',
    'assigned_sent',
    'completed_sent',
    'sla_breach_sent'
  );

comment on index public.idx_notification_dedupe is
  'At most one system_logs claim per (source, bookingId, cleaner-or-empty) for outbound notification idempotency.';
