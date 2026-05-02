-- Key payment notification idempotency by Paystack reference (verify/webhook/retry),
-- not booking_id, so replays before/after booking row reconciliation dedupe correctly.

alter table public.notification_idempotency_claims
  add column if not exists reference text;

update public.notification_idempotency_claims c
set reference = trim(b.paystack_reference)
from public.bookings b
where c.booking_id = b.id
  and b.paystack_reference is not null
  and trim(b.paystack_reference) <> ''
  and (c.reference is null or trim(c.reference) = '');

update public.notification_idempotency_claims c
set reference = 'legacy:' || c.booking_id::text
where c.reference is null or trim(c.reference) = '';

-- Dedupe before new unique (keep earliest claim per key).
delete from public.notification_idempotency_claims a
using public.notification_idempotency_claims b
where a.reference = b.reference
  and a.event_type = b.event_type
  and a.channel = b.channel
  and a.created_at > b.created_at;

alter table public.notification_idempotency_claims
  alter column reference set not null;

alter table public.notification_idempotency_claims
  drop constraint if exists notification_idempotency_claims_booking_id_event_type_channel_key;

alter table public.notification_idempotency_claims
  alter column booking_id drop not null;

-- Long names truncate to 63 chars and can collide / confuse re-runs; use a short stable name.
alter table public.notification_idempotency_claims
  drop constraint if exists notification_idempotency_claims_reference_event_type_channel_key;

alter table public.notification_idempotency_claims
  drop constraint if exists nid_claims_ref_evt_channel_uniq;

alter table public.notification_idempotency_claims
  add constraint nid_claims_ref_evt_channel_uniq
  unique (reference, event_type, channel);

comment on column public.notification_idempotency_claims.reference is
  'Paystack transaction reference (or legacy: booking id) — uniqueness key with event_type + channel.';
comment on column public.notification_idempotency_claims.booking_id is
  'Optional correlation to bookings; not used for dedupe uniqueness.';
