-- BK-002: Allow R0 (promo/credit fully-covered) settlements with amount_paid_cents = 0
-- only when a linked promo_credit_cover payment_transactions row exists.
-- Does not weaken normal Paystack success (still requires amount_paid_cents > 0).
-- Forward-only: does not edit 20260850_bookings_payment_invariants_dedupe.sql.

-- Cross-row R0 discriminator for zero-cash success (CHECK may call this stable helper).
create or replace function public.booking_zero_cash_success_is_r0(
  p_booking_id uuid,
  p_payment_transaction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_booking_id is not null
    and p_payment_transaction_id is not null
    and exists (
      select 1
      from public.payment_transactions pt
      where pt.id = p_payment_transaction_id
        and pt.booking_id = p_booking_id
        and pt.entity_type = 'booking'
        and pt.entity_id = p_booking_id
        and pt.gateway = 'other'
        and pt.payment_channel = 'promo_credit_cover'
        and pt.gateway_reference = 'r0:' || p_booking_id::text
        and coalesce(pt.amount_cents, 0) = 0
    );
$$;

comment on function public.booking_zero_cash_success_is_r0(uuid, uuid) is
  'True when payment_transaction_id is a zero-amount promo_credit_cover R0 ledger row for the booking.';

revoke all on function public.booking_zero_cash_success_is_r0(uuid, uuid) from public;
grant execute on function public.booking_zero_cash_success_is_r0(uuid, uuid) to service_role;

alter table public.bookings drop constraint if exists bookings_paid_requires_amount;

alter table public.bookings
  add constraint bookings_paid_requires_amount
  check (
    payment_status is distinct from 'success'
    or (amount_paid_cents is not null and amount_paid_cents > 0)
    or (
      coalesce(amount_paid_cents, 0) = 0
      and payment_completed_at is not null
      and payment_transaction_id is not null
      and public.booking_zero_cash_success_is_r0(id, payment_transaction_id)
    )
  );

comment on constraint bookings_paid_requires_amount on public.bookings is
  'Success requires positive collected cash, OR zero cash with payment_completed_at and a linked promo_credit_cover R0 payment_transaction.';

-- Atomic R0 settle: ledger first, then booking success + zero cash + link in one transaction.
create or replace function public.settle_booking_fully_covered(p_booking_id uuid)
returns table (
  ok boolean,
  error_message text,
  payment_transaction_id uuid,
  already_settled boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bookings%rowtype;
  v_tx_id uuid;
  v_ref text;
  v_now timestamptz := now();
  v_total numeric;
begin
  if p_booking_id is null then
    return query select false, 'missing_booking_id'::text, null::uuid, false;
    return;
  end if;

  select * into v_row
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return query select false, 'booking_not_found'::text, null::uuid, false;
    return;
  end if;

  v_total := coalesce(v_row.total_price, 0);

  if lower(coalesce(v_row.payment_status, '')) = 'success'
     and v_row.payment_transaction_id is not null
     and public.booking_zero_cash_success_is_r0(p_booking_id, v_row.payment_transaction_id) then
    return query select true, null::text, v_row.payment_transaction_id, true;
    return;
  end if;

  if v_total > 0 then
    return query select false, 'not_fully_covered'::text, null::uuid, false;
    return;
  end if;

  if lower(coalesce(v_row.status, '')) not in ('pending_payment', 'pending')
     and lower(coalesce(v_row.payment_status, '')) <> 'success' then
    return query select false, 'invalid_status_for_r0'::text, null::uuid, false;
    return;
  end if;

  v_ref := 'r0:' || p_booking_id::text;

  select pt.id into v_tx_id
  from public.payment_transactions pt
  where pt.gateway = 'other'
    and pt.gateway_reference = v_ref
    and pt.payment_channel = 'promo_credit_cover'
  limit 1;

  if v_tx_id is null then
    insert into public.payment_transactions (
      gateway,
      gateway_reference,
      gateway_transaction_id,
      entity_type,
      entity_id,
      amount_cents,
      currency_code,
      processing_fee_cents,
      processing_fee_vat_cents,
      net_settlement_cents,
      fee_calculation_method,
      settlement_status,
      settlement_date,
      payment_channel,
      booking_id,
      paid_at,
      raw_gateway_payload
    ) values (
      'other',
      v_ref,
      null,
      'booking',
      p_booking_id,
      0,
      'ZAR',
      0,
      0,
      0,
      'manual',
      'settled',
      (v_now at time zone 'UTC')::date,
      'promo_credit_cover',
      p_booking_id,
      v_now,
      jsonb_build_object('reason', 'fully_covered_by_promo_referral_or_credit')
    )
    returning id into v_tx_id;
  end if;

  update public.bookings b
  set
    status = case when lower(coalesce(b.status, '')) = 'pending_payment' then 'pending' else b.status end,
    payment_status = 'success',
    payment_completed_at = coalesce(b.payment_completed_at, v_now),
    billing_type = 'prepaid',
    payment_transaction_id = v_tx_id,
    amount_paid_cents = 0,
    total_paid_cents = 0,
    total_paid_zar = 0
  where b.id = p_booking_id;

  return query select true, null::text, v_tx_id, false;
end;
$$;

comment on function public.settle_booking_fully_covered(uuid) is
  'Atomically settle a fully covered (R0) booking: promo_credit_cover ledger + success with zero collected cash.';

revoke all on function public.settle_booking_fully_covered(uuid) from public;
grant execute on function public.settle_booking_fully_covered(uuid) to service_role;
