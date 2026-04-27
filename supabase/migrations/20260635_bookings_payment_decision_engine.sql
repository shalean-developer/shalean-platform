-- Payment-link decision engine: ops priority + last decision snapshot (additive, non-breaking).

alter table public.bookings
  add column if not exists booking_priority text not null default 'normal'
    check (booking_priority in ('normal', 'high'));

alter table public.bookings
  add column if not exists last_decision_snapshot jsonb;

comment on column public.bookings.booking_priority is
  'Elevated attention for predictive payment risk (distinct from payment_needs_follow_up).';

comment on column public.bookings.last_decision_snapshot is
  'Latest payment-link decision output (channels, risk, reason) for debugging and ops review.';
