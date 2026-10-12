-- AUDIT-02A07: bounded, one-booking-at-a-time historical line-item repair.
-- Service-role only. No booking earnings/payout fields are updated here.

create or replace function public.apply_audit_02a07_historical_line_items(
  p_booking_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_item jsonb;
  v_item_count integer := 0;
  v_item_total bigint := 0;
  v_inserted integer := 0;
  v_existing_count integer := 0;
  v_existing_total bigint := 0;
  v_mismatch_id constant uuid := 'e6a876b3-81fa-4da4-95d5-9f9a467ae970'::uuid;
begin
  if p_booking_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_booking_id');
  end if;

  if not (p_booking_id = any(array[
    'e8f35a89-8e20-4990-8c9b-7259f9215761'::uuid,
    '66743961-d167-4bbb-bb07-c22e2bdc61f9'::uuid,
    'a2b59a39-f929-4f0b-bc3f-c4b1340dbac3'::uuid,
    '08636b07-a56b-4ad1-987d-ef22306bb72b'::uuid,
    '1c1efc82-294d-4fca-9e6a-71a6713c527f'::uuid,
    '100b9bd3-2676-4dd7-91ea-eeea025b2f2e'::uuid,
    'b9baf110-d5bf-49f9-91f3-46f6a5aa9b68'::uuid,
    'd44cfffe-6ea7-4e91-81fe-e2869af7f6a0'::uuid,
    'fb696921-add6-4b31-8b20-4a44ce72dc31'::uuid,
    '14b6c042-a761-4b14-b96f-2c04b5d70c50'::uuid,
    '8989c390-d855-447a-a249-fceaac4df75a'::uuid,
    '2960ebdf-ad04-4210-acc8-28f1c8df1d8e'::uuid,
    '1e2f0c30-5cba-4e0b-8fec-f744c6cb471d'::uuid,
    'a6a40c58-f95d-456b-8e59-31d113d4a581'::uuid,
    '83d906cc-e757-4a41-8afa-881b43989ac2'::uuid,
    '073947f2-d37d-4852-9a2d-5bdd138d2440'::uuid,
    'da35fe22-6c69-42ad-9e39-8c8b46f11a7c'::uuid,
    '089ae00e-f419-4407-a795-4b8c290103f6'::uuid,
    '229f2f07-0422-44f7-b1bc-c3341e66f770'::uuid,
    'b69a0b5b-a2a9-4160-9782-3a1ff5ca4702'::uuid,
    'af54d55d-31e9-4729-bcb0-b1861b6181dd'::uuid,
    '32af82dd-daaf-4eb8-9cfc-f17fb46875da'::uuid,
    '6b439d7e-245c-419d-888b-cd58a03836b4'::uuid,
    '8655ed37-2b2b-4560-8415-dd5b091a9adc'::uuid,
    'e6a876b3-81fa-4da4-95d5-9f9a467ae970'::uuid,
    'fc75a013-5858-43e8-b499-3aa2ab047bcf'::uuid
  ])) then
    return jsonb_build_object('ok', false, 'error', 'booking_outside_allowlist');
  end if;

  select *
    into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_items');
  end if;

  select count(*)::integer, coalesce(sum(total_price_cents),0)::bigint
    into v_existing_count, v_existing_total
    from public.booking_line_items
   where booking_id = p_booking_id;

  if p_booking_id = v_mismatch_id then
    if v_existing_count = 2
       and v_existing_total = 48600
       and exists (
         select 1 from public.booking_line_items
          where booking_id=p_booking_id
            and item_type='base'
            and name='Recurring service'
            and total_price_cents=46700
            and pricing_source='exact_source_lines_v1'
            and earns_cleaner=true
            and cleaner_earnings_cents=30000
       )
       and exists (
         select 1 from public.booking_line_items
          where booking_id=p_booking_id
            and item_type='adjustment'
            and total_price_cents=1900
            and pricing_source='audit_02a07_historical_reconciliation_v1'
            and earns_cleaner=false
       )
    then
      return jsonb_build_object('ok', true, 'already_repaired', true, 'line_count', 2, 'total_cents', 48600);
    end if;

    if lower(coalesce(v_booking.status,'')) <> 'completed'
       or v_booking.is_team_job = true
       or coalesce(v_booking.cleaner_earnings_total_cents,0) <> 30000
       or v_booking.cleaner_line_earnings_finalized_at is null
       or lower(coalesce(v_booking.payout_status,'')) <> 'pending'
       or v_booking.payout_paid_at is not null
       or v_booking.payout_frozen_cents is not null
    then
      return jsonb_build_object('ok', false, 'error', 'mismatch_booking_financial_state_changed');
    end if;

    if v_existing_count <> 1
       or v_existing_total <> 46700
       or not exists (
         select 1 from public.booking_line_items
          where booking_id=p_booking_id
            and item_type='base'
            and name='Recurring service'
            and total_price_cents=46700
            and pricing_source='exact_source_lines_v1'
            and earns_cleaner=true
            and cleaner_earnings_cents=30000
       )
    then
      return jsonb_build_object('ok', false, 'error', 'mismatch_existing_line_state_changed');
    end if;

    if jsonb_array_length(p_items) <> 1 then
      return jsonb_build_object('ok', false, 'error', 'mismatch_requires_single_adjustment');
    end if;

    v_item := p_items->0;
    if coalesce(v_item->>'item_type','') <> 'adjustment'
       or coalesce((v_item->>'total_price_cents')::integer,0) <> 1900
       or coalesce((v_item->>'unit_price_cents')::integer,0) <> 1900
       or coalesce((v_item->>'quantity')::integer,0) <> 1
       or coalesce((v_item->>'earns_cleaner')::boolean,true) <> false
    then
      return jsonb_build_object('ok', false, 'error', 'invalid_mismatch_adjustment');
    end if;

    insert into public.booking_line_items (
      booking_id,item_type,slug,name,quantity,unit_price_cents,total_price_cents,
      pricing_source,metadata,earns_cleaner
    ) values (
      p_booking_id,
      'adjustment',
      nullif(v_item->>'slug',''),
      coalesce(nullif(trim(v_item->>'name'),''),'Historical total reconciliation'),
      1,
      1900,
      1900,
      'audit_02a07_historical_reconciliation_v1',
      coalesce(v_item->'metadata','{}'::jsonb),
      false
    );

    return jsonb_build_object('ok', true, 'already_repaired', false, 'line_count', 2, 'total_cents', 48600);
  end if;

  if v_existing_count > 0 then
    if v_existing_total = round(coalesce(v_booking.total_price,0)*100)::bigint
       and not exists (
         select 1 from public.booking_line_items
          where booking_id=p_booking_id
            and (
              coalesce(pricing_source,'') <> 'audit_02a07_snapshot_v1'
              or earns_cleaner <> false
            )
       )
    then
      return jsonb_build_object(
        'ok', true, 'already_repaired', true,
        'line_count', v_existing_count, 'total_cents', v_existing_total
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'existing_line_items_conflict');
  end if;

  if v_booking.is_team_job <> true then
    if lower(coalesce(v_booking.status,'')) <> 'cancelled'
       or v_booking.cleaner_line_earnings_finalized_at is not null
       or coalesce(v_booking.cleaner_earnings_total_cents,0) <> 0
       or coalesce(v_booking.display_earnings_cents,0) <> 0
       or coalesce(v_booking.payout_earnings_cents,0) <> 0
       or coalesce(v_booking.internal_earnings_cents,0) <> 0
       or lower(coalesce(v_booking.payout_status,'')) <> 'pending'
       or v_booking.payout_paid_at is not null
       or v_booking.payout_frozen_cents is not null
    then
      return jsonb_build_object('ok', false, 'error', 'solo_booking_not_earnings_safe');
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'item_type','') not in ('base','room','bathroom','extra','adjustment') then
      return jsonb_build_object('ok', false, 'error', 'invalid_item_type');
    end if;
    if nullif(trim(coalesce(v_item->>'name','')), '') is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_item_name');
    end if;
    if coalesce((v_item->>'quantity')::integer,0) < 1 then
      return jsonb_build_object('ok', false, 'error', 'invalid_item_quantity');
    end if;
    if coalesce((v_item->>'earns_cleaner')::boolean,true) <> false then
      return jsonb_build_object('ok', false, 'error', 'historical_line_must_not_earn_cleaner');
    end if;
    v_item_count := v_item_count + 1;
    v_item_total := v_item_total + coalesce((v_item->>'total_price_cents')::integer,0);
  end loop;

  if v_item_total <> round(coalesce(v_booking.total_price,0)*100)::bigint then
    return jsonb_build_object(
      'ok', false, 'error', 'item_total_mismatch',
      'item_total_cents', v_item_total,
      'expected_total_cents', round(coalesce(v_booking.total_price,0)*100)::bigint
    );
  end if;

  insert into public.booking_line_items (
    booking_id,item_type,slug,name,quantity,unit_price_cents,total_price_cents,
    pricing_source,metadata,earns_cleaner
  )
  select
    p_booking_id,
    value->>'item_type',
    nullif(value->>'slug',''),
    value->>'name',
    (value->>'quantity')::integer,
    (value->>'unit_price_cents')::integer,
    (value->>'total_price_cents')::integer,
    'audit_02a07_snapshot_v1',
    coalesce(value->'metadata','{}'::jsonb),
    false
  from jsonb_array_elements(p_items);

  get diagnostics v_inserted = row_count;

  if v_inserted <> v_item_count then
    raise exception 'AUDIT-02A07 inserted row count mismatch';
  end if;

  select count(*)::integer, coalesce(sum(total_price_cents),0)::bigint
    into v_existing_count, v_existing_total
    from public.booking_line_items
   where booking_id=p_booking_id;

  if v_existing_count <> v_item_count
     or v_existing_total <> round(coalesce(v_booking.total_price,0)*100)::bigint
     or exists (
       select 1 from public.booking_line_items
        where booking_id=p_booking_id and earns_cleaner <> false
     )
  then
    raise exception 'AUDIT-02A07 post-insert reconciliation failed';
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_repaired', false,
    'line_count', v_existing_count,
    'total_cents', v_existing_total
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;

revoke all on function public.apply_audit_02a07_historical_line_items(uuid,jsonb) from public;
revoke all on function public.apply_audit_02a07_historical_line_items(uuid,jsonb) from anon;
revoke all on function public.apply_audit_02a07_historical_line_items(uuid,jsonb) from authenticated;
grant execute on function public.apply_audit_02a07_historical_line_items(uuid,jsonb) to service_role;
