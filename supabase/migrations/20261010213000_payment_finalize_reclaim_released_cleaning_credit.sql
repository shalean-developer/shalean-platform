-- PAYMENT-FINALIZATION: late verified Paystack success must reclaim a Cleaning Credit
-- reservation that was released when the pending payment expired.
--
-- The booking finalizer already calls settle_cleaning_credit_for_booking after persisting
-- a successful charge. For a released reservation, reverse the provisional release from
-- the customer's current credit balance, then settle the original reservation. This keeps
-- the payment/credit ledger consistent even when the Paystack webhook arrives after expiry.

create or replace function public.settle_cleaning_credit_for_booking(p_booking_id uuid)
returns table (ok boolean, reservation_id uuid, status text, error_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.cleaning_credit_reservations%rowtype;
  v_balance numeric;
  v_after numeric;
begin
  select *
  into v
  from public.cleaning_credit_reservations
  where booking_id = p_booking_id
  for update;

  if not found then
    return query select false, null::uuid, null::text, 'reservation_not_found';
    return;
  end if;

  if v.status = 'settled' then
    return query select true, v.id, v.status, null::text;
    return;
  end if;

  if v.status = 'released' then
    select coalesce(credit_balance_zar, 0)
    into v_balance
    from public.user_profiles
    where id = v.user_id
    for update;

    if not found then
      return query select false, v.id, v.status, 'user_not_found';
      return;
    end if;

    -- The release was provisional because the gateway outcome was not yet persisted.
    -- Once Paystack success is proven, reclaim exactly that released amount. A negative
    -- balance is intentional if the customer spent the temporarily restored credit:
    -- it records the real liability instead of double-funding the booking.
    v_after := round((v_balance - v.amount_zar) * 100) / 100;
    update public.user_profiles
      set credit_balance_zar = v_after
      where id = v.user_id;
  else
    select coalesce(credit_balance_zar, 0)
    into v_after
    from public.user_profiles
    where id = v.user_id;
  end if;

  insert into public.cleaning_credit_transactions(
    user_id,
    amount_zar,
    balance_after_zar,
    type,
    booking_id,
    note,
    created_by
  )
  values (
    v.user_id,
    -v.amount_zar,
    coalesce(v_after, 0),
    'spend',
    v.booking_id,
    case
      when v.status = 'released' then 'Settled Cleaning Credit reservation after late verified payment'
      else 'Settled Cleaning Credit reservation'
    end,
    'checkout_reservation'
  );

  update public.cleaning_credit_reservations
    set status = 'settled',
        settled_at = now(),
        updated_at = now()
    where id = v.id;

  return query select true, v.id, 'settled'::text, null::text;
end;
$$;

revoke all on function public.settle_cleaning_credit_for_booking(uuid) from public, anon, authenticated;
grant execute on function public.settle_cleaning_credit_for_booking(uuid) to service_role;
