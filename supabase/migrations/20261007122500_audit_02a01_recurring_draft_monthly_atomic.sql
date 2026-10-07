-- AUDIT-02A01: forward-only extension for draft monthly recurring repricing.
-- Prior recurring RPC migrations remain immutable. This definition adds a serialized
-- invoice-finalization boundary for draft monthly occurrences.
create or replace function public.apply_recurring_occurrence_unpaid_patch(
  p_booking_id uuid,
  p_patch jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $audit02a01_recurring_rpc$
declare
  v_row public.bookings%rowtype;
  v_updated_id uuid;
  v_invoice_status text;
  v_invoice_snapshot_at_finalize jsonb;
  v_invoice_snapshot_current jsonb;
  v_invoice_finalized_at timestamptz;
  v_invoice_paystack_reference text;
  v_invoice_payment_link text;
  v_invoice_sent_at timestamptz;
  v_invoice_zoho_invoice_id text;
  v_invoice_email_claimed boolean;
  v_is_ordinary_pending boolean := false;
  v_is_draft_monthly boolean := false;
begin
  -- Serialize against payment_transactions FK inserts and booking settlement updates.
  select *
    into v_row
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    return false;
  end if;

  v_is_ordinary_pending :=
    lower(trim(coalesce(v_row.status, ''))) = 'pending_payment'
    and lower(trim(coalesce(v_row.payment_status, '')))
      not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly');

  if lower(trim(coalesce(v_row.payment_status, ''))) = 'pending_monthly'
     and v_row.monthly_invoice_id is not null
  then
    select
      lower(trim(coalesce(mi.status, ''))),
      mi.snapshot_at_finalize,
      mi.snapshot_current,
      mi.finalized_at,
      mi.paystack_reference,
      mi.payment_link,
      mi.sent_at,
      mi.zoho_invoice_id,
      mi.initial_invoice_email_dispatch_claimed
    into
      v_invoice_status,
      v_invoice_snapshot_at_finalize,
      v_invoice_snapshot_current,
      v_invoice_finalized_at,
      v_invoice_paystack_reference,
      v_invoice_payment_link,
      v_invoice_sent_at,
      v_invoice_zoho_invoice_id,
      v_invoice_email_claimed
    from public.monthly_invoices mi
    where mi.id = v_row.monthly_invoice_id
    for update;

    v_is_draft_monthly :=
      v_invoice_status = 'draft'
      and v_invoice_snapshot_at_finalize is null
      and v_invoice_snapshot_current is null
      and v_invoice_finalized_at is null
      and nullif(trim(coalesce(v_invoice_paystack_reference, '')), '') is null
      and nullif(trim(coalesce(v_invoice_payment_link, '')), '') is null
      and v_invoice_sent_at is null
      and nullif(trim(coalesce(v_invoice_zoho_invoice_id, '')), '') is null
      and coalesce(v_invoice_email_claimed, false) = false
      and lower(trim(coalesce(v_row.status, ''))) in ('pending', 'assigned', 'pending_payment');
  end if;

  if not (v_is_ordinary_pending or v_is_draft_monthly)
     or v_row.payment_completed_at is not null
     or v_row.paid_at is not null
     or v_row.payment_transaction_id is not null
     or v_row.marked_paid_by_admin_id is not null
  then
    return false;
  end if;

  -- This query runs after the conflicting row lock has been acquired. If a
  -- concurrent gateway ledger insert started first, FOR UPDATE waits for it
  -- and this recheck sees the committed payment row before repricing.
  if exists (
    select 1
    from public.payment_transactions pt
    where pt.booking_id = p_booking_id
  ) then
    return false;
  end if;

  update public.bookings b
  set (
    booking_snapshot,
    total_price,
    amount_paid_cents,
    total_paid_cents,
    total_paid_zar,
    price_snapshot,
    location,
    time,
    service,
    service_slug,
    rooms,
    bathrooms,
    duration_minutes,
    selected_cleaner_id,
    assignment_type,
    cleaner_id
  ) = (
    select
      x.booking_snapshot,
      x.total_price,
      x.amount_paid_cents,
      x.total_paid_cents,
      x.total_paid_zar,
      x.price_snapshot,
      x.location,
      x.time,
      x.service,
      x.service_slug,
      x.rooms,
      x.bathrooms,
      x.duration_minutes,
      x.selected_cleaner_id,
      x.assignment_type,
      x.cleaner_id
    from jsonb_populate_record(b, p_patch) as x
  )
  where b.id = p_booking_id
    and (
      (
        lower(trim(coalesce(b.status, ''))) = 'pending_payment'
        and lower(trim(coalesce(b.payment_status, '')))
          not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
      )
      or (
        v_is_draft_monthly
        and lower(trim(coalesce(b.payment_status, ''))) = 'pending_monthly'
        and b.monthly_invoice_id = v_row.monthly_invoice_id
        and lower(trim(coalesce(b.status, ''))) in ('pending', 'assigned', 'pending_payment')
      )
    )
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

  return v_updated_id is not null;
end
$audit02a01_recurring_rpc$;

revoke all on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) from public;
revoke all on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) from anon;
revoke all on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) from authenticated;
grant execute on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) to service_role;

comment on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) is
  'AUDIT-02A01 atomic boundary: reprices an evidence-free pending checkout or untouched draft-monthly recurring occurrence, serializing against invoice finalization and settlement.';
