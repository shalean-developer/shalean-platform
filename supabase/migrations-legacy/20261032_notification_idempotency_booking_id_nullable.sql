-- Sales-document admin alerts (quote request, quote accepted) dedupe by reference only — no booking row.
-- Migration 20260868 should have dropped NOT NULL; re-apply safely for environments that missed it.

alter table public.notification_idempotency_claims
  alter column booking_id drop not null;

comment on column public.notification_idempotency_claims.booking_id is
  'Optional correlation to bookings; sales-document notifications omit this column.';
