-- AUDIT-02A01: atomically reprice only evidence-free unpaid recurring occurrences.
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
  v_updated_id uuid;
begin
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
    duration_minutes
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
      x.duration_minutes
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

  return v_updated_id is not null;
end
$audit02a01_recurring_rpc$;

revoke all on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) from public;
revoke all on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) from anon;
revoke all on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) from authenticated;
grant execute on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) to service_role;

comment on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) is
  'AUDIT-02A01 atomic boundary: reprices a recurring occurrence only while settlement evidence is absent.';
