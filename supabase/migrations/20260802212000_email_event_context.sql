-- Add stable business context to Resend webhook events so office timelines can
-- group email lifecycle events by booking, customer and message type.

alter table public.email_delivery_events
  add column if not exists booking_id uuid,
  add column if not exists customer_id uuid,
  add column if not exists message_type text,
  add column if not exists campaign_id text,
  add column if not exists tags jsonb not null default '{}'::jsonb;

create index if not exists email_delivery_events_booking_idx
  on public.email_delivery_events (booking_id, event_created_at desc)
  where booking_id is not null;

create index if not exists email_delivery_events_customer_idx
  on public.email_delivery_events (customer_id, event_created_at desc)
  where customer_id is not null;

create index if not exists email_delivery_events_message_type_idx
  on public.email_delivery_events (message_type, event_created_at desc)
  where message_type is not null;
