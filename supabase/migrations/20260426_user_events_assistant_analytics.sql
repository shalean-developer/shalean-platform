-- Assistant analytics: slot/extra/recommendation events (for future ML — non-blocking inserts via API)

alter table public.user_events drop constraint if exists user_events_event_type_check;

alter table public.user_events
  add constraint user_events_event_type_check
  check (
    event_type in (
      'booking_created',
      'booking_completed',
      'slot_selected',
      'extra_added',
      'recommendation_clicked'
    )
  );

comment on table public.user_events is
  'Analytics and lifecycle: booking_* from payment/cron; assistant_* from booking UX (optional booking_id).';
