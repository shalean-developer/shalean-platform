-- A02-03-02B1: forward-only expansion of the atomic historical team booking_line_items repair.
-- Service-role only. Adds exactly one newly audited booking (e865...) to the existing A allowlist.

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
  v_existing_index_count integer;
  v_existing_payload jsonb;
  v_requested_payload jsonb;
  v_inserted integer;
  v_authoritative_cents bigint;
begin
  if p_booking_id not in (
    'd860554e-c132-477b-bf15-557fb9c88a5e'::uuid,
    'f6b2316e-2518-4f43-b6e8-b050c6d07483'::uuid,
    'e865f74b-33af-481f-a12e-576e1e0ed227'::uuid
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

  if not exists (
    select 1
    from public.booking_cleaners bc
    where bc.booking_id = p_booking_id
  ) then
    raise exception 'a02_03_02_team_roster_required';
  end if;

  if not exists (
    select 1
    from public.team_job_member_payouts tp
    where tp.booking_id = p_booking_id
  ) then
    raise exception 'a02_03_02_team_payout_ledger_required';
  end if;

  v_authoritative_cents := case
    when coalesce(v_booking.amount_paid_cents, 0) > 0
      then v_booking.amount_paid_cents
    when coalesce(v_booking.total_paid_zar, 0) > 0
      then round(v_booking.total_paid_zar * 100)::bigint
    else 0
  end;

  if p_expected_total_cents is null
     or p_expected_total_cents <= 0
     or p_expected_total_cents::bigint <> v_authoritative_cents
  then
    raise exception 'a02_03_02_expected_total_mismatch';
  end if;

  if p_line_items is null
     or jsonb_typeof(p_line_items) <> 'array'
     or jsonb_array_length(p_line_items) < 1
  then
    raise exception 'a02_03_02_line_items_required';
  end if;

  v_expected_count := jsonb_array_length(p_line_items);

  select
    coalesce(sum((r->>'total_price_cents')::bigint), 0),
    coalesce(
      bool_and(
        coalesce((r->>'earns_cleaner')::boolean, true) = false
        and coalesce(r->>'pricing_source', '') = 'historical_team_snapshot_v1'
        and jsonb_typeof(r->'metadata') = 'object'
        and (r->'metadata'->>'sourceLineIndex') ~ '^[0-9]+$'
      ),
      false
    )
  into v_json_total, v_json_all_safe
  from jsonb_array_elements(p_line_items) as r;

  if v_json_total <> p_expected_total_cents::bigint
     or v_json_all_safe is not true
  then
    raise exception 'a02_03_02_payload_invariant_failed';
  end if;

  select
    count(*)::integer,
    coalesce(sum(total_price_cents), 0)::bigint,
    coalesce(
      bool_and(
        earns_cleaner = false
        and pricing_source = 'historical_team_snapshot_v1'
      ),
      false
    )
  into v_existing_count, v_existing_total, v_existing_all_safe
  from public.booking_line_items
  where booking_id = p_booking_id;

  if v_existing_count > 0 then
    select
      count(distinct source_index)::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'sourceLineIndex', source_index,
            'item_type', item_type,
            'slug', slug,
            'name', name,
            'quantity', quantity,
            'unit_price_cents', unit_price_cents,
            'total_price_cents', total_price_cents,
            'pricing_source', pricing_source,
            'metadata', metadata,
            'earns_cleaner', earns_cleaner
          )
          order by source_index
        ),
        '[]'::jsonb
      )
    into v_existing_index_count, v_existing_payload
    from (
      select
        case
          when (metadata->>'sourceLineIndex') ~ '^[0-9]+$'
            then (metadata->>'sourceLineIndex')::integer
          else null
        end as source_index,
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
    ) persisted;

    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'sourceLineIndex', (r->'metadata'->>'sourceLineIndex')::integer,
            'item_type', r->>'item_type',
            'slug', nullif(trim(r->>'slug'), ''),
            'name', coalesce(r->>'name', ''),
            'quantity', greatest(1, coalesce((r->>'quantity')::integer, 1)),
            'unit_price_cents', (r->>'unit_price_cents')::integer,
            'total_price_cents', (r->>'total_price_cents')::integer,
            'pricing_source', 'historical_team_snapshot_v1',
            'metadata', r->'metadata',
            'earns_cleaner', false
          )
          order by (r->'metadata'->>'sourceLineIndex')::integer
        ),
        '[]'::jsonb
      )
    into v_requested_payload
    from jsonb_array_elements(p_line_items) as r;

    if v_existing_count = v_expected_count
       and v_existing_total = p_expected_total_cents::bigint
       and v_existing_all_safe is true
       and v_existing_index_count = v_expected_count
       and v_existing_payload = v_requested_payload
    then
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
    r->'metadata',
    false,
    null
  from jsonb_array_elements(p_line_items) as r;

  get diagnostics v_inserted = row_count;

  if v_inserted <> v_expected_count then
    raise exception
      'a02_03_02_insert_count_mismatch expected %, inserted %',
      v_expected_count,
      v_inserted;
  end if;

  return 'inserted';
end
$a02_03_02$;

revoke all on function public.repair_a02_03_02_team_line_items(uuid, jsonb, integer) from public;
revoke all on function public.repair_a02_03_02_team_line_items(uuid, jsonb, integer) from anon;
revoke all on function public.repair_a02_03_02_team_line_items(uuid, jsonb, integer) from authenticated;
grant execute on function public.repair_a02_03_02_team_line_items(uuid, jsonb, integer) to service_role;

comment on function public.repair_a02_03_02_team_line_items(uuid, jsonb, integer) is
  'A02-03-02B1 bounded atomic historical team financial-ledger repair; expands the audited allowlist by exactly e865.';
