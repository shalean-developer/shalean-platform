-- Infinite recursion on bookings (e.g. "My Bookings"):
-- bookings_cleaner_select_assigned (20260853) checks booking_cleaners;
-- booking_cleaners_user_select_own re-reads bookings under the same role → loop.

create or replace function public.user_owns_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and b.user_id = auth.uid()
  );
$$;

comment on function public.user_owns_booking(uuid) is
  'True when auth.uid() owns the booking. SECURITY DEFINER avoids bookings↔booking_cleaners SELECT policy recursion.';

-- RLS bypass inside the function body is safe only when owner is a superuser/table owner (bypasses RLS); not e.g. authenticated.
alter function public.user_owns_booking(uuid) owner to postgres;

revoke all on function public.user_owns_booking(uuid) from public;
grant execute on function public.user_owns_booking(uuid) to authenticated;
grant execute on function public.user_owns_booking(uuid) to service_role;

drop policy if exists booking_cleaners_user_select_own on public.booking_cleaners;

create policy booking_cleaners_user_select_own
  on public.booking_cleaners
  for select
  to authenticated
  using (
    public.user_owns_booking(booking_cleaners.booking_id)
  );

comment on policy booking_cleaners_user_select_own on public.booking_cleaners is
  'Customer sees roster rows for their booking; uses user_owns_booking() to avoid RLS re-entry into bookings.';
