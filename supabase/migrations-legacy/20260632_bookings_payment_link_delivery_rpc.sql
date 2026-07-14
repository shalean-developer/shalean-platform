-- Single-transaction payment link delivery (counters + JSON + last_sent_at).
-- Replaces split RPC + client UPDATE to avoid double-increment on retry.

alter table public.bookings
  add column if not exists payment_conversion_bucket text
    check (
      payment_conversion_bucket is null
      or payment_conversion_bucket in ('instant', 'fast', 'medium', 'slow')
    );

comment on column public.bookings.payment_conversion_bucket is
  'Funnel bucket from payment_conversion_seconds: instant <5m, fast <30m, medium <2h, else slow.';

update public.bookings
set payment_conversion_bucket = case
  when payment_conversion_seconds is null then null
  when payment_conversion_seconds < 300 then 'instant'
  when payment_conversion_seconds < 1800 then 'fast'
  when payment_conversion_seconds < 7200 then 'medium'
  else 'slow'
end
where payment_conversion_seconds is not null
  and payment_conversion_bucket is null;

create or replace function public.bookings_record_payment_link_delivery(
  p_booking_id uuid,
  p_payment_link_delivery jsonb,
  p_touch_last_sent_at boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.bookings
  set
    payment_link_delivery = p_payment_link_delivery,
    payment_link_send_count = coalesce(payment_link_send_count, 0) + 1,
    payment_link_first_sent_at = coalesce(payment_link_first_sent_at, now()),
    payment_link_last_sent_at = case
      when p_touch_last_sent_at then now()
      else payment_link_last_sent_at
    end,
    payment_needs_follow_up = case
      when coalesce(payment_link_send_count, 0) + 1 >= 3 then true
      else payment_needs_follow_up
    end
  where id = p_booking_id
  returning payment_link_send_count into v_count;

  if v_count is null then
    raise exception 'booking not found: %', p_booking_id;
  end if;
end;
$$;

comment on function public.bookings_record_payment_link_delivery(uuid, jsonb, boolean) is
  'Atomically merges payment link delivery JSON, increments send count, first/last sent timestamps, and follow-up flag.';

revoke all on function public.bookings_record_payment_link_delivery(uuid, jsonb, boolean) from public;
grant execute on function public.bookings_record_payment_link_delivery(uuid, jsonb, boolean) to service_role;

drop function if exists public.bookings_record_payment_link_send(uuid);
