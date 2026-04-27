-- Scale: partial index for last-touch / multi-touch reads, normalized phone for O(1) velocity lookup.

create index if not exists idx_payment_events_booking_sent
  on public.payment_link_delivery_events (booking_id, created_at desc)
  where status = 'sent';

comment on index public.idx_payment_events_booking_sent is
  'Partial index for attribution queries (sent events only, newest first per booking).';

alter table public.bookings
  add column if not exists normalized_phone text;

comment on column public.bookings.normalized_phone is
  'Digits-only E.164-style key from customer_phone (non-digits stripped); maintained by trigger.';

update public.bookings
set normalized_phone = nullif(regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g'), '')
where customer_phone is not null
  and (normalized_phone is null or normalized_phone = '');

create index if not exists idx_bookings_normalized_phone
  on public.bookings (normalized_phone)
  where normalized_phone is not null and length(normalized_phone) >= 10;

create or replace function public.bookings_set_normalized_phone()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.normalized_phone :=
    nullif(regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g'), '');
  return new;
end;
$$;

drop trigger if exists trg_bookings_normalized_phone on public.bookings;
create trigger trg_bookings_normalized_phone
before insert or update of customer_phone on public.bookings
for each row
execute function public.bookings_set_normalized_phone();

comment on function public.bookings_set_normalized_phone() is
  'Keeps bookings.normalized_phone in sync with customer_phone for indexed identity lookups.';

-- Multi-touch payment link attribution (journey beyond last-touch conversion_channel).
alter table public.bookings
  add column if not exists payment_first_touch_channel text
    check (payment_first_touch_channel is null or payment_first_touch_channel in ('whatsapp', 'sms', 'email'));

alter table public.bookings
  add column if not exists payment_last_touch_channel text
    check (payment_last_touch_channel is null or payment_last_touch_channel in ('whatsapp', 'sms', 'email'));

alter table public.bookings
  add column if not exists payment_assist_channels jsonb not null default '[]'::jsonb;

comment on column public.bookings.payment_first_touch_channel is
  'First successful payment-link delivery channel for this checkout (from payment_link_delivery_events).';

comment on column public.bookings.payment_last_touch_channel is
  'Last successful delivery channel before payment (mirrors conversion_channel).';

comment on column public.bookings.payment_assist_channels is
  'Ordered unique middle channels between first and last successful sends (JSON array of strings).';
