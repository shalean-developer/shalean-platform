-- Phase 8D: granular Meta delivery/read events + reliability metrics (idempotent per message_id + status).

alter table public.dispatch_offers
  add column if not exists first_read_at timestamptz;

comment on column public.dispatch_offers.first_read_at is
  'First time Meta reported read receipt for this offer outbound wamid (Phase 8D).';

alter table public.whatsapp_logs
  add column if not exists meta_receipt_status text,
  add column if not exists first_read_at timestamptz,
  add column if not exists failure_category text;

comment on column public.whatsapp_logs.meta_receipt_status is
  'Latest Meta lifecycle status from webhooks: sent | delivered | read | failed (does not replace legacy status column).';
comment on column public.whatsapp_logs.failure_category is
  'Normalized failure bucket when Meta reports failed (Phase 8D taxonomy).';

create table if not exists public.whatsapp_delivery_events (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  event_at timestamptz not null,
  booking_id uuid references public.bookings (id) on delete set null,
  cleaner_id uuid references public.cleaners (id) on delete set null,
  failure_category text
    check (
      failure_category is null
      or failure_category in (
        'invalid_number',
        'blocked',
        'template_rejected',
        'rate_limited',
        'unknown'
      )
    ),
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_delivery_events_message_status_uidx
  on public.whatsapp_delivery_events (message_id, status);

create index if not exists whatsapp_delivery_events_event_at_idx
  on public.whatsapp_delivery_events (event_at desc);

create index if not exists whatsapp_delivery_events_booking_event_at_idx
  on public.whatsapp_delivery_events (booking_id, event_at desc)
  where booking_id is not null;

comment on table public.whatsapp_delivery_events is
  'Idempotent Meta message status webhooks (sent/delivered/read/failed) for WhatsApp channel analytics.';

alter table public.whatsapp_delivery_events enable row level security;

revoke all on public.whatsapp_delivery_events from public;
grant select, insert on public.whatsapp_delivery_events to service_role;

drop function if exists public.admin_whatsapp_reliability_metrics(timestamptz);

-- Single round-trip for admin dashboard (service_role only).
-- Optional p_until (exclusive) bounds the window for prior-period comparisons.
create or replace function public.admin_whatsapp_reliability_metrics(
  p_since timestamptz,
  p_until timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with agg as (
    select
      message_id,
      bool_or(status = 'sent') as had_sent,
      bool_or(status = 'delivered') as had_delivered,
      bool_or(status = 'read') as had_read,
      bool_or(status = 'failed') as had_failed
    from public.whatsapp_delivery_events
    where event_at >= p_since
      and (p_until is null or event_at < p_until)
    group by message_id
  ),
  ch as (
    select
      count(*) filter (where had_sent)::bigint as messages_sent,
      count(*) filter (where had_delivered)::bigint as messages_delivered,
      count(*) filter (where had_read)::bigint as messages_read,
      count(*) filter (where had_failed)::bigint as messages_failed
    from agg
  ),
  disp as (
    select
      count(*)::bigint as offers_whatsapp_sent,
      count(*) filter (where responded_at is not null)::bigint as offers_replied,
      count(*) filter (where status = 'accepted')::bigint as offers_accepted,
      count(*) filter (where status = 'rejected')::bigint as offers_declined,
      avg(response_latency_ms)::double precision as avg_response_latency_ms,
      count(*) filter (where first_read_at is not null)::bigint as offers_read
    from public.dispatch_offers
    where whatsapp_sent_at is not null
      and whatsapp_sent_at >= p_since
      and (p_until is null or whatsapp_sent_at < p_until)
  )
  select jsonb_build_object(
    'since', p_since,
    'until', p_until,
    'channel', (
      select jsonb_build_object(
        'messages_sent', coalesce(messages_sent, 0),
        'messages_delivered', coalesce(messages_delivered, 0),
        'messages_read', coalesce(messages_read, 0),
        'messages_failed', coalesce(messages_failed, 0),
        'delivery_rate',
          case
            when coalesce(messages_sent, 0) > 0
              then round((coalesce(messages_delivered, 0)::numeric / messages_sent::numeric), 6)
          end,
        'read_rate',
          case
            when coalesce(messages_delivered, 0) > 0
              then round((coalesce(messages_read, 0)::numeric / messages_delivered::numeric), 6)
          end
      )
      from ch
    ),
    'dispatch', (
      select jsonb_build_object(
        'offers_whatsapp_sent', coalesce(offers_whatsapp_sent, 0),
        'offers_replied', coalesce(offers_replied, 0),
        'offers_accepted', coalesce(offers_accepted, 0),
        'offers_declined', coalesce(offers_declined, 0),
        'offers_with_read_receipt', coalesce(offers_read, 0),
        'reply_rate',
          case
            when coalesce(offers_whatsapp_sent, 0) > 0
              then round((coalesce(offers_replied, 0)::numeric / offers_whatsapp_sent::numeric), 6)
          end,
        'accept_rate',
          case
            when coalesce(offers_whatsapp_sent, 0) > 0
              then round((coalesce(offers_accepted, 0)::numeric / offers_whatsapp_sent::numeric), 6)
          end,
        'read_receipt_rate',
          case
            when coalesce(offers_whatsapp_sent, 0) > 0
              then round((coalesce(offers_read, 0)::numeric / offers_whatsapp_sent::numeric), 6)
          end,
        'avg_response_latency_ms', avg_response_latency_ms
      )
      from disp
    )
  );
$$;

comment on function public.admin_whatsapp_reliability_metrics(timestamptz, timestamptz) is
  'Aggregated WhatsApp delivery + dispatch-offer funnel for admin dashboards (Phase 8D).';

revoke all on function public.admin_whatsapp_reliability_metrics(timestamptz, timestamptz) from public;
grant execute on function public.admin_whatsapp_reliability_metrics(timestamptz, timestamptz) to service_role;
