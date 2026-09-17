-- Qualify output-column names in the idempotent rewarded-referral retry path.
create or replace function public.award_customer_referral_credit(
  p_referral_id uuid,
  p_referred_user_id uuid default null,
  p_booking_id uuid default null,
  p_credit_expires_at timestamptz default null,
  p_note text default null
)
returns table (ok boolean, balance_after_zar numeric, error_message text)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_referral public.referrals%rowtype;
  v_credit record;
  v_existing_balance numeric;
begin
  select * into v_referral
  from public.referrals
  where id = p_referral_id
  for update;

  if not found then
    return query select false, 0::numeric, 'referral_not_found'::text;
    return;
  end if;

  if v_referral.referrer_type <> 'customer' then
    return query select false, 0::numeric, 'invalid_referrer_type'::text;
    return;
  end if;

  if v_referral.status = 'rewarded' then
    select c.balance_after_zar into v_existing_balance
    from public.cleaning_credit_transactions as c
    where c.referral_id = p_referral_id and c.type = 'earn'
    order by c.created_at desc
    limit 1;

    if found then
      return query select true, coalesce(v_existing_balance, 0), null::text;
      return;
    end if;

    return query select false, 0::numeric, 'rewarded_without_credit'::text;
    return;
  end if;

  if v_referral.status <> 'pending' then
    return query select false, 0::numeric, 'referral_not_pending'::text;
    return;
  end if;

  select * into v_credit
  from public.apply_cleaning_credit_transaction(
    p_user_id => v_referral.referrer_id,
    p_amount_zar => greatest(0, round(coalesce(v_referral.reward_amount, 0))),
    p_type => 'earn',
    p_referral_id => v_referral.id,
    p_booking_id => p_booking_id,
    p_note => p_note,
    p_created_by => 'referral_completion'
  );

  if not coalesce(v_credit.ok, false) then
    return query select false, coalesce(v_credit.balance_after_zar, 0),
      coalesce(v_credit.error_message, 'credit_transaction_failed')::text;
    return;
  end if;

  update public.referrals
  set status = 'rewarded',
      completed_at = now(),
      rewarded_at = now(),
      credit_expires_at = p_credit_expires_at,
      referred_user_id = coalesce(p_referred_user_id, referred_user_id)
  where id = v_referral.id and status = 'pending';

  if not found then
    raise exception 'referral_state_changed';
  end if;

  return query select true, v_credit.balance_after_zar, null::text;
end;
$function$;

revoke execute on function public.award_customer_referral_credit(uuid, uuid, uuid, timestamptz, text)
from public, anon, authenticated;
grant execute on function public.award_customer_referral_credit(uuid, uuid, uuid, timestamptz, text)
to service_role;
