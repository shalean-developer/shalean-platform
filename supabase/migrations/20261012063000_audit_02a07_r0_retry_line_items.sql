-- AUDIT-02A07 follow-up: allow safe replacement of stale pending-checkout
-- line items when a reused pending booking is repriced to R0.
-- Service-role only. No historical repair is performed by this migration.

create or replace function public.replace_pending_r0_booking_line_items(
  p_booking_id uuid,
  p_expected_total_cents integer,
  p_expected_evidence jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_current_evidence jsonb;
  v_item jsonb;
  v_count integer := 0;
  v_total bigint := 0;
  v_inserted integer := 0;
begin
  if p_booking_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_booking_id');
  end if;
  if p_expected_total_cents is null or p_expected_total_cents < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_expected_total');
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_items');
  end if;

  select *
    into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  if lower(trim(coalesce(v_booking.status, ''))) not in ('pending_payment', 'pending') then
    return jsonb_build_object('ok', false, 'error', 'booking_not_pending');
  end if;

  if lower(trim(coalesce(v_booking.payment_status, ''))) in ('success', 'paid', 'succeeded')
     or v_booking.payment_completed_at is not null
     or v_booking.payment_transaction_id is not null
  then
    return jsonb_build_object('ok', false, 'error', 'booking_already_settled');
  end if;

  if round(coalesce(v_booking.total_price, 0) * 100)::integer <> p_expected_total_cents then
    return jsonb_build_object(
      'ok', false,
      'error', 'booking_total_changed',
      'actual_total_cents', round(coalesce(v_booking.total_price, 0) * 100)::integer
    );
  end if;

  v_current_evidence := jsonb_build_object(
    'booking_snapshot', coalesce(v_booking.booking_snapshot, 'null'::jsonb),
    'pricing_summary', coalesce(v_booking.pricing_summary, 'null'::jsonb),
    'price_breakdown', coalesce(v_booking.price_breakdown, 'null'::jsonb),
    'is_team_job', to_jsonb(v_booking.is_team_job)
  );

  if v_current_evidence is distinct from p_expected_evidence then
    return jsonb_build_object('ok', false, 'error', 'pricing_evidence_changed');
  end if;

  -- A reused pending booking may already carry Paystack-initialize line items.
  -- They are safe to replace only while the booking is still pending/unsettled
  -- and after the current pricing evidence above has matched exactly.
  if exists (
    select 1
      from public.booking_line_items bli
     where bli.booking_id = p_booking_id
       and coalesce(bli.pricing_source, '') not in (
         'audit_02a07_snapshot_v1',
         'checkout_lock_catalog_v1',
         'checkout_payable_reconciliation_v1'
       )
  ) then
    return jsonb_build_object('ok', false, 'error', 'existing_line_items_conflict');
  end if;

  if v_booking.cleaner_line_earnings_finalized_at is not null
     or v_booking.payout_paid_at is not null
     or v_booking.payout_frozen_cents is not null
  then
    return jsonb_build_object('ok', false, 'error', 'pending_line_items_financial_state_changed');
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'item_type', '') not in ('base','room','bathroom','extra','adjustment') then
      return jsonb_build_object('ok', false, 'error', 'invalid_item_type');
    end if;
    if nullif(trim(coalesce(v_item->>'name', '')), '') is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_item_name');
    end if;
    if coalesce((v_item->>'quantity')::integer, 0) < 1 then
      return jsonb_build_object('ok', false, 'error', 'invalid_item_quantity');
    end if;
    v_count := v_count + 1;
    v_total := v_total + coalesce((v_item->>'total_price_cents')::integer, 0);
  end loop;

  if v_total <> p_expected_total_cents then
    return jsonb_build_object(
      'ok', false,
      'error', 'item_total_mismatch',
      'item_total_cents', v_total,
      'expected_total_cents', p_expected_total_cents
    );
  end if;

  delete from public.booking_line_items
   where booking_id = p_booking_id
     and pricing_source in (
       'audit_02a07_snapshot_v1',
       'checkout_lock_catalog_v1',
       'checkout_payable_reconciliation_v1'
     );

  insert into public.booking_line_items (
    booking_id,
    item_type,
    slug,
    name,
    quantity,
    unit_price_cents,
    total_price_cents,
    pricing_source,
    metadata,
    earns_cleaner
  )
  select
    p_booking_id,
    value->>'item_type',
    nullif(value->>'slug', ''),
    value->>'name',
    (value->>'quantity')::integer,
    (value->>'unit_price_cents')::integer,
    (value->>'total_price_cents')::integer,
    'audit_02a07_snapshot_v1',
    coalesce(value->'metadata', '{}'::jsonb),
    coalesce((value->>'earns_cleaner')::boolean, true)
  from jsonb_array_elements(p_items);

  get diagnostics v_inserted = row_count;

  if v_inserted <> v_count then
    raise exception 'AUDIT-02A07 inserted row count mismatch: % <> %', v_inserted, v_count;
  end if;

  if (
    select coalesce(sum(total_price_cents), 0)
    from public.booking_line_items
    where booking_id = p_booking_id
  ) <> p_expected_total_cents then
    raise exception 'AUDIT-02A07 persisted total mismatch';
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'line_count', v_inserted,
    'total_cents', p_expected_total_cents
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;

revoke all on function public.replace_pending_r0_booking_line_items(uuid, integer, jsonb, jsonb) from public;
revoke all on function public.replace_pending_r0_booking_line_items(uuid, integer, jsonb, jsonb) from anon;
revoke all on function public.replace_pending_r0_booking_line_items(uuid, integer, jsonb, jsonb) from authenticated;
grant execute on function public.replace_pending_r0_booking_line_items(uuid, integer, jsonb, jsonb) to service_role;
