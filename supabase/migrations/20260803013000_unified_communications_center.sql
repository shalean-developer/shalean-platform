-- Phase 6: unified customer communication center.

create or replace view public.communication_timeline as
select
  ('email:' || e.id::text) as id,
  'email'::text as channel,
  e.event_type as status,
  e.message_type,
  e.recipient_email as recipient,
  e.subject as summary,
  e.booking_id,
  e.customer_id,
  e.resend_email_id as provider_message_id,
  coalesce(e.event_created_at, e.received_at) as occurred_at,
  e.payload as metadata
from public.email_delivery_events e
union all
select
  ('whatsapp-log:' || w.id::text) as id,
  'whatsapp'::text as channel,
  coalesce(w.meta_receipt_status, w.status) as status,
  w.message_type,
  w.phone as recipient,
  coalesce(w.error_message, w.message_type) as summary,
  w.booking_id,
  b.customer_id,
  w.meta_message_id as provider_message_id,
  w.created_at as occurred_at,
  coalesce(w.webhook_payload, '{}'::jsonb) as metadata
from public.whatsapp_logs w
left join public.bookings b on b.id = w.booking_id
union all
select
  ('notification:' || n.id::text) as id,
  coalesce(nullif(n.channel, ''), 'notification')::text as channel,
  n.status,
  coalesce(n.template_key, n.event_type) as message_type,
  n.recipient,
  coalesce(n.error, n.template_key, n.event_type) as summary,
  case when n.booking_id ~* '^[0-9a-f-]{36}$' then n.booking_id::uuid else null end as booking_id,
  b.customer_id,
  null::text as provider_message_id,
  n.created_at as occurred_at,
  coalesce(n.payload, '{}'::jsonb) as metadata
from public.notification_logs n
left join public.bookings b on b.id = case when n.booking_id ~* '^[0-9a-f-]{36}$' then n.booking_id::uuid else null end
union all
select
  ('push:' || p.id::text) as id,
  'push'::text as channel,
  case when p.read_at is null then 'sent' else 'read' end as status,
  p.type as message_type,
  p.user_id::text as recipient,
  p.title as summary,
  p.booking_id,
  case when u.role = 'customer' then u.id else null end as customer_id,
  null::text as provider_message_id,
  p.created_at as occurred_at,
  jsonb_build_object('body', p.body, 'read_at', p.read_at) as metadata
from public.user_notifications p
left join public.users u on u.id = p.user_id;

grant select on public.communication_timeline to service_role;
revoke all on public.communication_timeline from anon, authenticated;
