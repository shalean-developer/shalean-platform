-- Idempotent booking cancellation notifications (one wave per booking).

drop index if exists public.idx_notification_dedupe;

delete from public.system_logs s
using (
  select id,
    row_number() over (
      partition by source, context->>'bookingId', coalesce(context->>'cleanerId', '')
      order by created_at asc, id asc
    ) as rn
  from public.system_logs
  where source in (
    'reminder_2h_sent',
    'assigned_sent',
    'completed_sent',
    'cancelled_sent',
    'sla_breach_sent',
    'review_prompt_sms_sent',
    'review_prompt_sms_reminder_sent',
    'abandon_checkout_reminder_sent',
    'daily_ops_summary',
    'dispatch_admin_mark_paid',
    'dispatch_edit_details'
  )
) ranked
where s.id = ranked.id
  and ranked.rn > 1;

create unique index idx_notification_dedupe
  on public.system_logs (
    source,
    (context->>'bookingId'),
    coalesce(context->>'cleanerId', '')
  )
  where source in (
    'reminder_2h_sent',
    'assigned_sent',
    'completed_sent',
    'cancelled_sent',
    'sla_breach_sent',
    'review_prompt_sms_sent',
    'review_prompt_sms_reminder_sent',
    'abandon_checkout_reminder_sent',
    'daily_ops_summary',
    'dispatch_admin_mark_paid',
    'dispatch_edit_details'
  );

comment on index public.idx_notification_dedupe is
  'At most one system_logs claim per (source, bookingId, cleaner-or-empty) for outbound notification / dispatch idempotency.';
