-- Write-once defense: (user_id, id) matches composite natural key; id remains `customerUuid:idempotencyKey` text.
create unique index if not exists uniq_admin_billing_idem_user_id_id
  on public.admin_billing_idempotency (user_id, id);

comment on index public.uniq_admin_billing_idem_user_id_id is
  'Ensures one idempotency row per customer + id (id embeds Idempotency-Key).';

-- Align RPC JSON with client-cached terminal shape (explicit booleans, schedule_enforced on all branches).
create or replace function public.admin_billing_switch_finalize(
  p_customer_id uuid,
  p_billing_type text,
  p_target_schedule_type text,
  p_schedule_enforced boolean,
  p_confirm boolean,
  p_confirm_strict boolean,
  p_strict_flip_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_billing text;
  v_from_schedule text;
  v_to_schedule text;
  v_jhb date;
  v_ym text;
  v_start text;
  v_end text;
  v_bookings int := 0;
  v_inv_status text;
  v_inv_month text;
  v_has_month_invoice boolean := false;
  v_has_activity boolean;
  v_flipping_monthly boolean;
  v_strict_scenario boolean;
  v_impact jsonb;
  v_now timestamptz := now();
begin
  if p_billing_type not in ('per_booking', 'monthly') then
    return jsonb_build_object('ok', false, 'error', 'invalid_billing_type');
  end if;

  if p_target_schedule_type not in ('fixed_schedule', 'on_demand') then
    return jsonb_build_object('ok', false, 'error', 'invalid_schedule_type');
  end if;

  insert into public.user_profiles (id, booking_count, total_spent_cents, billing_type, schedule_type, updated_at)
  values (p_customer_id, 0, 0, 'per_booking', 'on_demand', v_now)
  on conflict (id) do nothing;

  select
    coalesce(billing_type, 'per_booking'),
    coalesce(schedule_type, 'on_demand')
  into v_from_billing, v_from_schedule
  from public.user_profiles
  where id = p_customer_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  v_to_schedule := case
    when p_billing_type = 'monthly' then 'on_demand'::text
    else p_target_schedule_type
  end;

  if v_from_billing = p_billing_type and v_from_schedule = v_to_schedule then
    v_jhb := (v_now at time zone 'Africa/Johannesburg')::date;
    v_ym := to_char(v_jhb, 'YYYY-MM');
    v_start := v_ym || '-01';
    v_end := to_char((date_trunc('month', v_jhb) + interval '1 month - 1 day')::date, 'YYYY-MM-DD');

    select count(*)::int into v_bookings
    from public.bookings
    where user_id = p_customer_id
      and date >= v_start
      and date <= v_end;

    select mi.status, mi.month into v_inv_status, v_inv_month
    from public.monthly_invoices mi
    where mi.customer_id = p_customer_id
      and mi.month = v_ym
    limit 1;

    v_has_month_invoice := found;

    v_impact := jsonb_build_object(
      'bookings_count', v_bookings,
      'invoice_status', case when v_has_month_invoice then v_inv_status else null end,
      'invoice_month', case when v_has_month_invoice then coalesce(v_inv_month, v_ym) else null end,
      'has_month_invoice', v_has_month_invoice
    );

    return jsonb_build_object(
      'ok', true,
      'code', 'NO_CHANGE',
      'requires_confirmation', false,
      'requires_strict_confirmation', false,
      'billing_type', v_from_billing,
      'schedule_type', v_from_schedule,
      'schedule_enforced', false,
      'impact', v_impact
    );
  end if;

  v_jhb := (v_now at time zone 'Africa/Johannesburg')::date;
  v_ym := to_char(v_jhb, 'YYYY-MM');
  v_start := v_ym || '-01';
  v_end := to_char((date_trunc('month', v_jhb) + interval '1 month - 1 day')::date, 'YYYY-MM-DD');

  select count(*)::int into v_bookings
  from public.bookings
  where user_id = p_customer_id
    and date >= v_start
    and date <= v_end;

  select mi.status, mi.month into v_inv_status, v_inv_month
  from public.monthly_invoices mi
  where mi.customer_id = p_customer_id
    and mi.month = v_ym
  limit 1;

  v_has_month_invoice := found;

  v_impact := jsonb_build_object(
    'bookings_count', v_bookings,
    'invoice_status', case when v_has_month_invoice then v_inv_status else null end,
    'invoice_month', case when v_has_month_invoice then coalesce(v_inv_month, v_ym) else null end,
    'has_month_invoice', v_has_month_invoice
  );

  v_has_activity := v_bookings > 0 or v_has_month_invoice;
  v_flipping_monthly :=
    (v_from_billing <> p_billing_type)
    and (v_from_billing = 'monthly' or p_billing_type = 'monthly');
  v_strict_scenario :=
    p_strict_flip_enabled
    and v_flipping_monthly
    and v_bookings > 0
    and v_has_month_invoice;

  if v_has_activity and not p_confirm then
    return jsonb_build_object(
      'ok', true,
      'code', 'EXISTING_ACTIVITY_THIS_MONTH',
      'requires_confirmation', true,
      'requires_strict_confirmation', false,
      'schedule_enforced', false,
      'reason', 'existing_activity_this_month',
      'details', jsonb_build_object(
        'bookings_count', v_bookings,
        'invoice_status', case when v_has_month_invoice then v_inv_status else null end,
        'invoice_month', case when v_has_month_invoice then coalesce(v_inv_month, v_ym) else null end
      ),
      'billing_type', v_from_billing,
      'schedule_type', v_from_schedule,
      'impact', v_impact
    );
  end if;

  if v_strict_scenario and p_confirm and not p_confirm_strict then
    return jsonb_build_object(
      'ok', true,
      'code', 'STRICT_CONFIRM_REQUIRED',
      'requires_confirmation', false,
      'requires_strict_confirmation', true,
      'schedule_enforced', false,
      'reason', 'mid_cycle_monthly_flip',
      'details', jsonb_build_object(
        'bookings_count', v_bookings,
        'invoice_status', case when v_has_month_invoice then v_inv_status else null end,
        'invoice_month', case when v_has_month_invoice then coalesce(v_inv_month, v_ym) else null end
      ),
      'billing_type', v_from_billing,
      'schedule_type', v_from_schedule,
      'impact', v_impact
    );
  end if;

  update public.user_profiles
  set
    billing_type = p_billing_type,
    schedule_type = v_to_schedule,
    updated_at = v_now
  where id = p_customer_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'UPDATED',
    'requires_confirmation', false,
    'requires_strict_confirmation', false,
    'billing_type', p_billing_type,
    'schedule_type', v_to_schedule,
    'schedule_enforced', p_schedule_enforced,
    'impact', v_impact
  );
end;
$$;

comment on function public.admin_billing_switch_finalize(uuid, text, text, boolean, boolean, boolean, boolean) is
  'Admin billing switch: FOR UPDATE on user_profiles, Johannesburg-month impact, confirmation guards, then UPDATE. Coerces monthly → on_demand schedule.';

revoke all on function public.admin_billing_switch_finalize(uuid, text, text, boolean, boolean, boolean, boolean) from public;

grant execute on function public.admin_billing_switch_finalize(uuid, text, text, boolean, boolean, boolean, boolean) to service_role;
