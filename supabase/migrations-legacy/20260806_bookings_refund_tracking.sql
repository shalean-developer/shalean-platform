-- Optional refund / reversal tracking (used to suppress paid-signal earnings recompute).
alter table public.bookings add column if not exists refunded_at timestamptz;

alter table public.bookings add column if not exists refund_status text;

comment on column public.bookings.refunded_at is 'When a refund or reversal was recorded for this booking.';
comment on column public.bookings.refund_status is 'Refund lifecycle, e.g. partial | full | reversed — null means no refund.';
