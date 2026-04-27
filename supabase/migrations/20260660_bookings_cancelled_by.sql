-- Attribution for cancelled bookings (ranking + analytics). Legacy rows stay null.

alter table public.bookings
  add column if not exists cancelled_by text;

alter table public.bookings
  drop constraint if exists bookings_cancelled_by_check;

alter table public.bookings
  add constraint bookings_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('customer', 'cleaner', 'system'));

comment on column public.bookings.cancelled_by is
  'Who initiated cancellation when status = cancelled: customer, cleaner, system (ops/automation). Null for legacy or non-cancelled.';

create index if not exists bookings_cancelled_by_idx
  on public.bookings (cancelled_by)
  where status = 'cancelled' and cancelled_by is not null;
