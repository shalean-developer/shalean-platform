-- AUDIT-02A01 PRE-DEPLOY: install the backward-compatible atomic pending-checkout writer.
--
-- Release order:
--   1. apply this migration;
--   2. deploy the application writer that calls this RPC;
--   3. apply the later AUDIT-02A01 post-deploy cash repair/constraint migration.
--
-- This migration intentionally does NOT install the pending-cash CHECK constraint.
-- The currently deployed pre-AUDIT writer may still mirror payable into total_paid_zar,
-- so enforcing the constraint before the application cutover would break live checkout.

create or replace function public.apply_pending_booking_init_patch(
  p_booking_id uuid,
  p_patch jsonb,
  p_line_items jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $audit02a01_rpc$
declare
  v_row public.bookings%rowtype;
  v_updated_id uuid;
  v_expected integer := 0;
  v_inserted integer := 0;
begin
  select *
    into v_row
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    return null;
  end if;

  if lower(trim(coalesce(v_row.status, ''))) <> 'pending_payment'
     or lower(trim(coalesce(v_row.payment_status, '')))
        in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
     or v_row.payment_completed_at is not null
     or v_row.paid_at is not null
     or v_row.payment_transaction_id is not null
     or v_row.marked_paid_by_admin_id is not null
     or exists (
       select 1
       from public.payment_transactions pt
       where pt.booking_id = p_booking_id
     )
  then
    return null;
  end if;

  if p_line_items is not null then
    if jsonb_typeof(p_line_items) <> 'array' or jsonb_array_length(p_line_items) < 1 then
      raise exception 'apply_pending_booking_init_patch: p_line_items must be a non-empty array when supplied';
    end if;
    v_expected := jsonb_array_length(p_line_items);
  end if;

  update public.bookings b
  set (
    booking_snapshot,
    duration_minutes,
    price_breakdown,
    total_price,
    price_snapshot,
    amount_paid_cents,
    total_paid_cents,
    total_paid_zar,
    customer_name,
    customer_phone,
    customer_id,
    location_id,
    city_id,
    surge_multiplier,
    surge_reason,
    extras,
    slot_duplicate_exempt,
    admin_force_slot_override,
    selected_cleaner_id,
    assignment_type,
    cleaner_count,
    cleaner_share_percentage
  ) = (
    select
      x.booking_snapshot,
      x.duration_minutes,
      x.price_breakdown,
      x.total_price,
      x.price_snapshot,
      x.amount_paid_cents,
      x.total_paid_cents,
      x.total_paid_zar,
      x.customer_name,
      x.customer_phone,
      x.customer_id,
      x.location_id,
      x.city_id,
      x.surge_multiplier,
      x.surge_reason,
      x.extras,
      x.slot_duplicate_exempt,
      x.admin_force_slot_override,
      x.selected_cleaner_id,
      x.assignment_type,
      x.cleaner_count,
      x.cleaner_share_percentage
    from jsonb_populate_record(b, p_patch) as x
  )
  where b.id = p_booking_id
    and lower(trim(coalesce(b.status, ''))) = 'pending_payment'
    and lower(trim(coalesce(b.payment_status, '')))
      not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
    and b.payment_completed_at is null
    and b.paid_at is null
    and b.payment_transaction_id is null
    and b.marked_paid_by_admin_id is null
    and not exists (
      select 1
      from public.payment_transactions pt
      where pt.booking_id = b.id
    )
  returning b.id into v_updated_id;

  if v_updated_id is null then
    return null;
  end if;

  if p_line_items is not null then
    delete from public.booking_line_items where booking_id = p_booking_id;

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
      nullif(trim(r->>'pricing_source'), ''),
      case
        when jsonb_typeof(r->'metadata') = 'object' then r->'metadata'
        else '{}'::jsonb
      end,
      coalesce((r->>'earns_cleaner')::boolean, (r->>'item_type')::text is distinct from 'adjustment'),
      null
    from jsonb_array_elements(p_line_items) as r;

    get diagnostics v_inserted = row_count;
    if v_inserted <> v_expected then
      raise exception
        'apply_pending_booking_init_patch: expected % line rows, inserted %',
        v_expected,
        v_inserted;
    end if;
  end if;

  return v_updated_id;
end
$audit02a01_rpc$;

revoke all on function public.apply_pending_booking_init_patch(uuid, jsonb, jsonb) from public;
revoke all on function public.apply_pending_booking_init_patch(uuid, jsonb, jsonb) from anon;
revoke all on function public.apply_pending_booking_init_patch(uuid, jsonb, jsonb) from authenticated;
grant execute on function public.apply_pending_booking_init_patch(uuid, jsonb, jsonb) to service_role;

comment on function public.apply_pending_booking_init_patch(uuid, jsonb, jsonb) is
  'AUDIT-02A01 pre-deploy atomic boundary: updates a safely-unpaid pending booking and, when supplied, replaces booking_line_items in the same transaction.';
