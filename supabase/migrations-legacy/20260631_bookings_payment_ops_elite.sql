-- Payment link attempt counts, conversion metrics, ops follow-up flag, and atomic send counter.

alter table public.bookings
  add column if not exists payment_link_send_count integer not null default 0
    check (payment_link_send_count >= 0);

alter table public.bookings
  add column if not exists payment_link_first_sent_at timestamptz;

alter table public.bookings
  add column if not exists payment_needs_follow_up boolean not null default false;

alter table public.bookings
  add column if not exists payment_completed_at timestamptz;

alter table public.bookings
  add column if not exists payment_conversion_seconds integer
    check (payment_conversion_seconds is null or payment_conversion_seconds >= 0);

comment on column public.bookings.payment_link_send_count is
  'Increments on each payment-link delivery persist (admin sends + cron reminders).';

comment on column public.bookings.payment_link_first_sent_at is
  'Timestamp of the first payment-link notification wave; anchor for payment_conversion_seconds.';

comment on column public.bookings.payment_needs_follow_up is
  'Ops escalation: unpaid link expired, or payment_link_send_count reached follow-up threshold.';

comment on column public.bookings.payment_completed_at is
  'Customer payment settled (Paystack); used with payment_link_first_sent_at for conversion.';

comment on column public.bookings.payment_conversion_seconds is
  'Seconds from payment_link_first_sent_at to payment_completed_at when both are set.';

create or replace function public.bookings_record_payment_link_send(p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.bookings
  set
    payment_link_send_count = coalesce(payment_link_send_count, 0) + 1,
    payment_link_first_sent_at = coalesce(payment_link_first_sent_at, now()),
    payment_needs_follow_up = case
      when coalesce(payment_link_send_count, 0) + 1 >= 3 then true
      else payment_needs_follow_up
    end
  where id = p_booking_id
  returning payment_link_send_count into v_count;

  if v_count is null then
    raise exception 'booking not found: %', p_booking_id;
  end if;

  return v_count;
end;
$$;

comment on function public.bookings_record_payment_link_send(uuid) is
  'Atomically increments payment_link_send_count, sets payment_link_first_sent_at once, and may set payment_needs_follow_up after 3 sends.';

revoke all on function public.bookings_record_payment_link_send(uuid) from public;
grant execute on function public.bookings_record_payment_link_send(uuid) to service_role;
