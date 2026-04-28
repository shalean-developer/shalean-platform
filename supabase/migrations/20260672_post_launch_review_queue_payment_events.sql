-- Post-launch: deferred review SMS queue, extra notification dedupe keys, payment funnel user_events.

-- ---------------------------------------------------------------------------
-- Review SMS: first send 30–60m after completion; reminder at 24h (handled in app cron)
-- ---------------------------------------------------------------------------
create table if not exists public.review_sms_prompt_queue (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  first_due_at timestamptz not null,
  reminder_due_at timestamptz not null,
  first_sent_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists review_sms_prompt_queue_first_due_idx
  on public.review_sms_prompt_queue (first_due_at)
  where first_sent_at is null;

create index if not exists review_sms_prompt_queue_reminder_due_idx
  on public.review_sms_prompt_queue (reminder_due_at)
  where first_sent_at is not null and reminder_sent_at is null;

comment on table public.review_sms_prompt_queue is 'Deferred review SMS: app cron sends first after first_due_at, optional reminder after reminder_due_at.';

alter table public.review_sms_prompt_queue enable row level security;

-- ---------------------------------------------------------------------------
-- Notification dedupe: review reminder + abandoned checkout reminder
-- ---------------------------------------------------------------------------
drop index if exists public.idx_notification_dedupe;

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
    'sla_breach_sent',
    'review_prompt_sms_sent',
    'review_prompt_sms_reminder_sent',
    'abandon_checkout_reminder_sent',
    'daily_ops_summary'
  )
)
delete from public.system_logs s
using ranked r
where s.id = r.id
  and r.rn > 1;

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
    'sla_breach_sent',
    'review_prompt_sms_sent',
    'review_prompt_sms_reminder_sent',
    'abandon_checkout_reminder_sent',
    'daily_ops_summary'
  );

-- ---------------------------------------------------------------------------
-- user_events: payment funnel (client + server)
-- ---------------------------------------------------------------------------
alter table public.user_events drop constraint if exists user_events_event_type_check;

alter table public.user_events
  add constraint user_events_event_type_check
  check (
    event_type in (
      'booking_created',
      'booking_completed',
      'slot_selected',
      'extra_added',
      'recommendation_clicked',
      'flow_step_viewed',
      'flow_drop_off',
      'booking_agent_quote',
      'booking_agent_confirm',
      'page_view',
      'start_booking',
      'view_price',
      'select_time',
      'complete_booking',
      'referral_created',
      'referral_completed',
      'referral_rewarded',
      'growth_retention_reminder',
      'growth_win_back',
      'growth_ltv_message',
      'cleaners_loaded',
      'times_loaded',
      'price_calculated',
      'booking_started',
      'booking_upsell_interaction',
      'homepage_continue_booking',
      'homepage_cta_click',
      'homepage_service_select',
      'pricing_loaded',
      'homepage_abandon',
      'homepage_scroll',
      'price_updated',
      'review_submitted',
      'review_prompt_sent',
      'review_prompt_clicked',
      'payment_initiated',
      'payment_completed'
    )
  );
