-- A02-03-02A: atomic, bounded historical team booking_line_items repair.
-- Service-role only. Hard-bounded to the two audited historical team bookings.

create or replace function public.repair_a02_03_02_team_line_items(
  p_booking_id uuid,
  p_line_items jsonb,
  p_expected_total_cents integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $a02_03_02$
declare
  v_booking public.bookings%rowtype;
  v_expected_count integer;
  v_json_total bigint;
  v_json_all_safe boolean;
  v_existing_count integer;
  v_existing_total bigint;
  v_existing_all_safe boolean;
  v_existing_matches_payload boolean;
  v_inserted integer;
  v_authoritative_cents bigint;
begin
  if p_booking_id not in (
    'd860554e-c132-477b-bf15-557fb9c88a5e'::uuid,
    'f6b2316e-2518-4f43-b6e8-b050c6d07483'::uuid
  ) then
    raise exception 'a02_03_02_target_not_allowlisted';
  end if;

  perform pg_advisory_xact_lock(920302, abs(hashtext(p_booking_id::text)));

  select *
    into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'a02_03_02_booking_not_found';
  end if;

  if coalesce(v_booking.is_team_job, false) is not true then
    raise exception 'a02_03_02_team_booking_required';
  end if;
  if lower(trim(coalesce(v_booking.payment_status, ''))) not in ('success', 'paid') then
    raise exception 'a02_03_02_paid_booking_required';
  end if;
  if lower(trim(coalesce(v_booking.billing_type, ''))) <> 'prepaid' then
    raise exception 'a02_03_02_prepaid_required';
  end if;

  if not exists (select 1 from public.booking_cleaners bc where bc.booking_id = p_booking_id) then
    raise exception 'a02_03_02_team_roster_required';
  end if;
  if not exists (select 1 from public.team_job_member_payouts tp where tp.booking_id = p_booking_id) then
    raise exception 'a02_03_02_team_payout_ledger_required';
  end if;

  v_authoritative_cents := case
    when coalesce(v_booking.amount_paid_cents, 0) > 0 then v_booking.amount_paid_cents
    when coalesce(v_booking.total_paid_zar, 0) > 0 then round(v_booking.total_paid_zar * 100)::bigint
    else 0
  end;

  if p_expected_total_cents is null or p_expected_total_cents <= 0
     or p_expected_total_cents::bigint <> v_authoritative_cents then
    raise exception 'a02_03_02_expected_total_mismatch';
  end if;

  if p_line_items is null or jsonb_typeof(p_line_items) <> 'array' or jsonb_array_length(p_line_items) < 1 then
    raise exception 'a02_03_02_line_items_required';
  end if;

  v_expected_count := jsonb_array_length(p_line_items);

  select
    coalesce(sum((r->>'total_price_cents')::bigint), 0),
    coalesce(bool_and(
      coalesce((r->>'earns_cleaner')::boolean, true) = false
      and coalesce(r->>'pricing_source', '') = 'historical_team_snapshot_v1'
    ), false)
  into v_json_total, v_json_all_safe
  from jsonb_array_elements(p_line_items) as r;

  if v_json_total <> p_expected_total_cents::bigint or v_json_all_safe is not true then
    raise exception 'a02_03_02_payload_invariant_failed';
  end if;

  select
    count(*)::integer,
    coalesce(sum(total_price_cents), 0)::bigint,
    coalesce(bool_and(
      earns_cleaner = false
      and pricing_source = 'historical_team_snapshot_v1'
    ), false)
  into v_existing_count, v_existing_total, v_existing_all_safe
  from public.booking_line_items
  where booking_id = p_booking_id;

  if v_existing_count > 0 then
    select
      count(*) = v_expected_count
      and not exists (
        select 1
        from (
          select
            row_number() over (order by created_at, id) - 1 as source_index,
            item_type,
            slug,
            name,
            quantity,
            unit_price_cents,
            total_price_cents,
            pricing_source,
            metadata,
            earns_cleaner
          from public.booking_line_items
          where booking_id = p_booking_id
        ) persisted
        full outer join (
          select
            ordinality - 1 as source_index,
            r->>'item_type' as item_type,
            nullif(trim(r->>'slug'), '') as slug,
            coalesce(r->>'name', '') as name,
            greatest(1, coalesce((r->>'quantity')::integer, 1)) as quantity,
            (r->>'unit_price_cents')::integer as unit_price_cents,
            (r->>'total_price_cents')::integer as total_price_cents,
            'historical_team_snapshot_v1'::text as pricing_source,
            case when jsonb_typeof(r->'metadata') = 'object' then r->'metadata' else '{}'::jsonb end as metadata,
            false as earns_cleaner
          from jsonb_array_elements(p_line_items) with ordinality as x(r, ordinality)
        ) requested
          using (source_index)
        where persisted.source_index is null
           or requested.source_index is null
           or persisted.item_type is distinct from requested.item_type
           or persisted.slug is distinct from requested.slug
           or persisted.name is distinct from requested.name
           or persisted.quantity is distinct from requested.quantity
           or persisted.unit_price_cents is distinct from requested.unit_price_cents
           or persisted.total_price_cents is distinct from requested.total_price_cents
           or persisted.pricing_source is distinct from requested.pricing_source
           or persisted.metadata is distinct from requested.metadata
           or persisted.earns_cleaner is distinct from requested.earns_cleaner
      )
    into v_existing_matches_payload
    from public.booking_line_items
    where booking_id = p_booking_id;

    if v_existing_count = v_expected_count
       and v_existing_total = p_expected_total_cents::bigint
       and v_existing_all_safe is true
       and v_existing_matches_payload is true then
      return 'already_repaired';
    end if;
    raise exception 'a02_03_02_existing_line_items_conflict';
  end if;

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
    earns_cleaner,
    cleaner_earnings_cents
  )
  select
    p_booking_id,
    r->>'item_type',
    nullif(trim(r->>'slug'), ''),
    coalesce(r->>'name', ''),
    greatest(1, coalesce((r->>'quantity')::integer, 1)),
    (r->>'unit_price_cents')::integer,
    (r->>'total_price_cents')::integer,
    'historical_team_snapshot_v1',
    case when jsonb_typeof(r->'metadata') = 'object' then r->'metadata' else '{}'::jsonb end,
    false,
    null
  from jsonb_array_elements(p_line_items) as r;

  get diagnostics v_inserted = row_count;
  if v_inserted <> v_expected_count then
    raise exception 'a02_03_02_insert_count_mismatch expected %, inserted %', v_expected_count, v_inserted;
  end if;

  return 'inserted';
end
$a02_03_02$;

revoke all on function public.repair_a02_03_02_team_line_items(uuid, jsonb, integer) from public;
revoke all on function public.repair_a02_03_02_team_line_items(uuid, jsonb, integer) from anon;
revoke all on function public.repair_a02_03_02_team_line_items(uuid, jsonb, integer) from authenticated;
grant execute on function public.repair_a02_03_02_team_line_items(uuid, jsonb, integer) to service_role;

comment on function public.repair_a02_03_02_team_line_items(uuid, jsonb, integer) is
  'A02-03-02A bounded atomic historical team financial-ledger repair for exactly two audited bookings.';
