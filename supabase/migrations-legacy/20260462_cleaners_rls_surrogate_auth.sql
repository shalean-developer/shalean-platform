-- Cleaners may use surrogate `id` with `auth_user_id` → auth.users. RLS must match either link.

drop policy if exists cleaners_select_own on public.cleaners;
create policy cleaners_select_own on public.cleaners
  for select to authenticated
  using (auth.uid() = auth_user_id or auth.uid() = id);

drop policy if exists cleaners_update_own on public.cleaners;
create policy cleaners_update_own on public.cleaners
  for update to authenticated
  using (auth.uid() = auth_user_id or auth.uid() = id)
  with check (auth.uid() = auth_user_id or auth.uid() = id);

-- Availability rows reference cleaners.id (surrogate), not auth uid.

drop policy if exists cleaner_availability_select_own on public.cleaner_availability;
create policy cleaner_availability_select_own on public.cleaner_availability
  for select to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_availability.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

drop policy if exists cleaner_availability_all_own on public.cleaner_availability;
create policy cleaner_availability_all_own on public.cleaner_availability
  for all to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_availability.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_availability.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

-- Assigned bookings: cleaner_id is FK to cleaners.id.

drop policy if exists bookings_cleaner_select_assigned on public.bookings;
create policy bookings_cleaner_select_assigned on public.bookings
  for select to authenticated
  using (
    cleaner_id is not null
    and exists (
      select 1 from public.cleaners c
      where c.id = bookings.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

-- Dispatch offers: same pattern.

drop policy if exists dispatch_offers_cleaner_select on public.dispatch_offers;
create policy dispatch_offers_cleaner_select on public.dispatch_offers
  for select to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = dispatch_offers.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

drop policy if exists dispatch_offers_cleaner_update_own on public.dispatch_offers;
create policy dispatch_offers_cleaner_update_own on public.dispatch_offers
  for update to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = dispatch_offers.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
    and dispatch_offers.status = 'pending'
  )
  with check (
    exists (
      select 1 from public.cleaners c
      where c.id = dispatch_offers.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );
