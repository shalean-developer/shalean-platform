-- Derived recurring Paystack payment lifecycle (mirrored from existing columns; not a second source of truth).

alter table public.bookings
  add column if not exists payment_state text;

alter table public.bookings drop constraint if exists bookings_payment_state_check;

alter table public.bookings
  add constraint bookings_payment_state_check
  check (
    payment_state is null
    or payment_state in (
      'awaiting_authorization',
      'charge_scheduled',
      'charged',
      'retry_scheduled',
      'failed',
      'fallback_sent'
    )
  );

comment on column public.bookings.payment_state is
  'Derived label for recurring-generated Paystack collection flow (see deriveRecurringPaymentState). Null when not applicable.';

create index if not exists bookings_payment_state_idx
  on public.bookings (payment_state)
  where payment_state is not null;
