-- Feed + dedupe: list by user ordered by recency, time-window scans on created_at.
create index if not exists idx_user_notifications_recent
  on public.user_notifications (user_id, created_at desc);

comment on index public.idx_user_notifications_recent is
  'Speeds notification list (user_id + created_at desc) and recent-window dedupe queries.';

-- Allow dedicated cancel rows for DB idempotency (one per user + booking).
alter table public.user_notifications drop constraint if exists user_notifications_type_check;
alter table public.user_notifications add constraint user_notifications_type_check
  check (type in ('confirmed', 'assigned', 'reminder', 'system', 'cancelled'));

-- Include cancelled in partial unique (replaces 20260482 definition).
drop index if exists public.user_notifications_idempotency_user_booking_type_key;

create unique index user_notifications_idempotency_user_booking_type_key
  on public.user_notifications (user_id, booking_id, type)
  where booking_id is not null
    and type in ('confirmed', 'assigned', 'reminder', 'cancelled');

comment on index public.user_notifications_idempotency_user_booking_type_key is
  'One lifecycle row per (user_id, booking_id, type); system may repeat; optional future idempotency_key column for multi-step / external workflows.';
