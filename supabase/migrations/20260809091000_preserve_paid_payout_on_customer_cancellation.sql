-- P4 closeout: customer cancellation changes revenue/refund state, not historical paid cleaner payout truth.

create or replace function public.preserve_paid_payout_on_booking_cancellation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(old.payout_status, '')) = 'paid'
     and lower(coalesce(new.status, '')) = 'cancelled' then
    new.cleaner_payout_cents := old.cleaner_payout_cents;
    new.cleaner_bonus_cents := old.cleaner_bonus_cents;
    new.payout_percentage := old.payout_percentage;
    new.payout_type := old.payout_type;
    new.payout_status := old.payout_status;
    new.payout_paid_at := old.payout_paid_at;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_preserve_paid_payout_on_cancellation on public.bookings;
create trigger bookings_preserve_paid_payout_on_cancellation
before update of status, cleaner_payout_cents, cleaner_bonus_cents, payout_percentage, payout_type, payout_status, payout_paid_at
on public.bookings
for each row execute function public.preserve_paid_payout_on_booking_cancellation();

comment on function public.preserve_paid_payout_on_booking_cancellation()
is 'Preserves immutable cleaner payout facts when a booking is later cancelled; customer refund/revenue changes are handled separately.';
