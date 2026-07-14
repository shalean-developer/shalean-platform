-- Infinite recursion: bookings_cleaner_select_assigned checks cleaners RLS;
-- cleaners_select_for_customer_booking checks bookings RLS → loop on customer dashboard.

create or replace function public.user_has_booking_with_cleaner(p_cleaner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    where b.cleaner_id = p_cleaner_id
      and b.user_id = auth.uid()
  );
$$;

comment on function public.user_has_booking_with_cleaner(uuid) is
  'True when the current user owns a booking assigned to p_cleaner_id. SECURITY DEFINER avoids bookings↔cleaners SELECT policy recursion.';

revoke all on function public.user_has_booking_with_cleaner(uuid) from public;
grant execute on function public.user_has_booking_with_cleaner(uuid) to authenticated;
grant execute on function public.user_has_booking_with_cleaner(uuid) to service_role;

drop policy if exists cleaners_select_for_customer_booking on public.cleaners;
create policy cleaners_select_for_customer_booking on public.cleaners
  for select to authenticated
  using (public.user_has_booking_with_cleaner(cleaners.id));
