-- booking_matches_active_admin_slot still compared b.user_id; production bookings use customer_id (20261021).

create or replace function public.booking_matches_active_admin_slot(
  b public.bookings,
  p_user_id uuid,
  p_date text,
  p_time text,
  p_service_slug text
)
returns boolean
language plpgsql
stable
as $f$
declare
  v_owner uuid;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'customer_id'
  ) then
    v_owner := b.customer_id;
  else
    v_owner := b.user_id;
  end if;

  return v_owner is not distinct from p_user_id
    and b.date is not distinct from p_date
    and b.time is not distinct from p_time
    and lower(trim(b.service_slug)) is not distinct from lower(trim(p_service_slug))
    and b.status not in ('cancelled', 'failed', 'payment_expired');
end;
$f$;

comment on function public.booking_matches_active_admin_slot(public.bookings, uuid, text, text, text) is
  'Predicate: booking row is same customer slot as duplicate probe / race resolver. Uses customer_id when present, else legacy user_id.';

revoke all on function public.booking_matches_active_admin_slot(public.bookings, uuid, text, text, text) from public;
grant execute on function public.booking_matches_active_admin_slot(public.bookings, uuid, text, text, text) to service_role;
