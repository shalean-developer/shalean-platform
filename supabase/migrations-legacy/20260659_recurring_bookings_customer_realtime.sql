-- Customer-facing Realtime on recurring plans (browser subscribes with authenticated session).

grant select on public.recurring_bookings to authenticated;

drop policy if exists recurring_bookings_customer_select_own on public.recurring_bookings;

create policy recurring_bookings_customer_select_own on public.recurring_bookings
  for select
  to authenticated
  using (customer_id = auth.uid());

do $$
begin
  begin
    alter publication supabase_realtime add table public.recurring_bookings;
  exception
    when duplicate_object then null;
  end;
end
$$;

comment on policy recurring_bookings_customer_select_own on public.recurring_bookings is
  'Customers read their own recurring rows for dashboard + Supabase Realtime (RLS filters events).';
