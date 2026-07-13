-- Link in-app notifications to bookings (deep links, dedupe, reminders).
alter table public.user_notifications
  add column if not exists booking_id uuid references public.bookings (id) on delete set null;

create index if not exists user_notifications_booking_type_created_idx
  on public.user_notifications (booking_id, type, created_at desc);

create index if not exists user_notifications_user_booking_idx
  on public.user_notifications (user_id, booking_id);

comment on column public.user_notifications.booking_id is 'Optional FK for booking-scoped notifications and dashboard deep links.';
