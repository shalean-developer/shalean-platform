-- Refine the payout-removal override so it remains authoritative only while
-- the booking still points at the historical cleaner/header from removal time.
-- A real reassignment to a different cleaner must re-enter the legacy earnings lock.

create or replace function public.apply_booking_earnings_policy_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy text := 'current_v1';
  v_legacy_cents integer;
  v_service text;
  v_financial_cap_cents bigint;
  v_marker jsonb;
  v_marker_cleaner text;
  v_header_at_removal text;
  v_primary_cleaner text;
begin
  v_service := lower(coalesce(new.service_slug, new.service, ''));

  if new.recurring_id is not null then
    select rb.earnings_policy, rb.legacy_earnings_cents
      into v_policy, v_legacy_cents
    from public.recurring_bookings rb
    where rb.id = new.recurring_id;
  end if;

  if coalesce(v_policy, 'current_v1') = 'current_v1' and new.customer_id is not null then
    select cep.earnings_policy, cep.legacy_earnings_cents
      into v_policy, v_legacy_cents
    from public.customer_earnings_policies cep
    where cep.customer_id = new.customer_id
      and v_service = any(cep.applies_to_services);
  end if;

  new.earnings_policy := coalesce(v_policy, 'current_v1');

  v_marker := new.metadata -> 'payout_attribution_removal_v1';
  if coalesce((v_marker ->> 'active')::boolean, false) then
    v_marker_cleaner := nullif(btrim(v_marker ->> 'cleaner_id'), '');
    v_header_at_removal := coalesce(
      nullif(btrim(v_marker ->> 'header_cleaner_id_at_removal'), ''),
      v_marker_cleaner
    );
    v_primary_cleaner := coalesce(
      nullif(btrim(new.cleaner_id::text), ''),
      nullif(btrim(new.payout_owner_cleaner_id::text), '')
    );

    -- The removal marker suppresses the legacy lock only while the booking is
    -- still unassigned or still points at the same historical header cleaner.
    -- A replacement cleaner makes the marker non-authoritative immediately,
    -- so the legacy fixed amount is restored during reassignment recompute.
    if v_header_at_removal is not null
       and (v_primary_cleaner is null or v_primary_cleaner = v_header_at_removal) then
      return new;
    end if;
  end if;

  if new.earnings_policy = 'legacy_july'
     and v_service in ('standard', 'regular-cleaning', 'airbnb')
     and coalesce(v_legacy_cents, 0) > 0 then
    new.display_earnings_cents := v_legacy_cents;
    new.internal_earnings_cents := v_legacy_cents;

    v_financial_cap_cents := case
      when lower(trim(coalesce(new.billing_type, ''))) = any (array['recurring_invoice', 'monthly_contract', 'pay_later'])
        or coalesce(new.is_monthly_billing_booking, false)
        or lower(trim(coalesce(new.payment_status, ''))) = 'pending_monthly'
        or new.monthly_invoice_id is not null
      then coalesce(
        new.total_paid_cents::bigint,
        case when new.total_paid_zar is not null and new.total_paid_zar > 0
          then round(new.total_paid_zar * 100)::bigint else null end,
        nullif(new.amount_paid_cents, 0)::bigint,
        0::bigint
      )
      else coalesce(
        new.total_paid_cents::bigint,
        new.amount_paid_cents::bigint,
        case when new.total_paid_zar is not null and new.total_paid_zar > 0
          then round(new.total_paid_zar * 100)::bigint else null end,
        0::bigint
      )
    end;

    if v_financial_cap_cents >= v_legacy_cents then
      new.cleaner_payout_cents := v_legacy_cents;
      new.payout_earnings_cents := v_legacy_cents;
      if new.payout_status = 'eligible' then
        new.payout_frozen_cents := v_legacy_cents;
      end if;
    else
      new.cleaner_payout_cents := null;
      new.payout_earnings_cents := null;
      if new.payout_status is distinct from 'eligible' then
        new.payout_frozen_cents := null;
      end if;
    end if;

    new.earnings_model_version := 'legacy_july_locked_v1';
    new.earnings_percentage_applied := null;
    new.earnings_cap_cents_applied := v_legacy_cents;
    new.earnings_tenure_months_at_assignment := null;
    new.earnings_policy_locked_at := coalesce(new.earnings_policy_locked_at, now());
  end if;

  return new;
end;
$$;

revoke all on function public.apply_booking_earnings_policy_lock() from public;
grant execute on function public.apply_booking_earnings_policy_lock() to service_role;
