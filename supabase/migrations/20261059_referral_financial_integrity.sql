-- Referral financial integrity: atomic credit ledger, promo cost views, reconciliation queue.

-- ---------------------------------------------------------------------------
-- Prevent duplicate earn rows per referral
-- ---------------------------------------------------------------------------
create unique index if not exists cleaning_credit_transactions_unique_earn_referral_uidx
  on public.cleaning_credit_transactions (referral_id)
  where type = 'earn' and referral_id is not null;

-- ---------------------------------------------------------------------------
-- Atomic credit balance + ledger (single transaction with row lock)
-- ---------------------------------------------------------------------------
create or replace function public.apply_cleaning_credit_transaction(
  p_user_id uuid,
  p_amount_zar numeric,
  p_type text,
  p_referral_id uuid default null,
  p_booking_id uuid default null,
  p_note text default null,
  p_created_by text default null
)
returns table (ok boolean, balance_after_zar numeric, error_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric;
  v_balance_after numeric;
  v_amount numeric;
begin
  if p_user_id is null then
    return query select false, 0::numeric, 'missing_user_id';
    return;
  end if;

  v_amount := round(coalesce(p_amount_zar, 0)::numeric, 2);

  if p_type not in ('earn', 'spend', 'reverse', 'admin_adjust', 'expire') then
    return query select false, 0::numeric, 'invalid_type';
    return;
  end if;

  if p_type = 'earn' and v_amount <= 0 then
    return query select false, 0::numeric, 'earn_must_be_positive';
    return;
  end if;

  if p_type in ('spend', 'reverse', 'expire') and v_amount >= 0 then
    return query select false, 0::numeric, 'debit_must_be_negative';
    return;
  end if;

  select coalesce(credit_balance_zar, 0) into v_current
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    return query select false, 0::numeric, 'user_not_found';
    return;
  end if;

  v_balance_after := greatest(0, round((v_current + v_amount) * 100) / 100);

  if v_current + v_amount < -0.001 then
    return query select false, v_current, 'insufficient_credit';
    return;
  end if;

  update public.user_profiles
  set credit_balance_zar = v_balance_after
  where id = p_user_id;

  insert into public.cleaning_credit_transactions (
    user_id, amount_zar, balance_after_zar, type, referral_id, booking_id, note, created_by
  ) values (
    p_user_id, v_amount, v_balance_after, p_type, p_referral_id, p_booking_id, p_note, p_created_by
  );

  return query select true, v_balance_after, null::text;
exception
  when unique_violation then
    return query select false, v_current, 'duplicate_earn_for_referral';
end;
$$;

comment on function public.apply_cleaning_credit_transaction is
  'Atomically updates user_profiles.credit_balance_zar and inserts cleaning_credit_transactions under row lock.';

revoke all on function public.apply_cleaning_credit_transaction from public;
grant execute on function public.apply_cleaning_credit_transaction to service_role;

-- ---------------------------------------------------------------------------
-- Per-booking promo costs (referral checkout discount + cleaning credit spend)
-- ---------------------------------------------------------------------------
create or replace view public.admin_booking_promo_costs as
select
  b.id as booking_id,
  b.date,
  b.city_id,
  coalesce(r.discount_zar, 0)::bigint as referral_discount_zar,
  coalesce(c.credit_spend_zar, 0)::bigint as cleaning_credit_spend_zar,
  (
    coalesce(r.discount_zar, 0) + coalesce(c.credit_spend_zar, 0)
  )::bigint as total_promo_cost_zar
from public.bookings b
left join public.referral_discount_redemptions r on r.booking_id = b.id
left join (
  select
    booking_id,
    sum(abs(amount_zar))::bigint as credit_spend_zar
  from public.cleaning_credit_transactions
  where type = 'spend' and booking_id is not null
  group by booking_id
) c on c.booking_id = b.id
where coalesce(r.discount_zar, 0) > 0 or coalesce(c.credit_spend_zar, 0) > 0;

comment on view public.admin_booking_promo_costs is
  'Referral checkout discounts and cleaning credit spend per booking (ZAR whole units).';

-- ---------------------------------------------------------------------------
-- Reconciliation queue for failed post-payment referral redemptions
-- ---------------------------------------------------------------------------
create or replace view public.admin_referral_reconciliation_queue as
select
  b.id as booking_id,
  b.date,
  b.customer_email,
  b.customer_name,
  b.total_paid_zar,
  b.status,
  b.paystack_reference,
  b.referral_reconciliation_required,
  b.created_at,
  b.payment_completed_at
from public.bookings b
where b.referral_reconciliation_required = true
order by b.created_at desc;

comment on view public.admin_referral_reconciliation_queue is
  'Bookings where Paystack succeeded but referral discount redemption could not be persisted.';

revoke all on public.admin_booking_promo_costs from anon, authenticated;
revoke all on public.admin_referral_reconciliation_queue from anon, authenticated;
grant select on public.admin_booking_promo_costs to service_role;
grant select on public.admin_referral_reconciliation_queue to service_role;
