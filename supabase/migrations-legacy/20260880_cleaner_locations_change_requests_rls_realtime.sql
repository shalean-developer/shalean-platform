-- Supabase Realtime postgres_changes only reach clients for rows the role can SELECT under RLS.
-- Replace blanket deny on cleaner_locations with own-row SELECT; align change-request policies
-- with cleaners surrogate auth (auth_user_id OR id = auth.uid()).

drop policy if exists cleaner_locations_no_anon on public.cleaner_locations;

create policy cleaner_locations_select_own
  on public.cleaner_locations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.cleaners c
      where c.id = cleaner_locations.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

grant select on public.cleaner_locations to authenticated;

drop policy if exists cleaner_change_requests_select_own on public.cleaner_change_requests;

create policy cleaner_change_requests_select_own
  on public.cleaner_change_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.cleaners c
      where c.id = cleaner_change_requests.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

drop policy if exists cleaner_change_requests_insert_own on public.cleaner_change_requests;

create policy cleaner_change_requests_insert_own
  on public.cleaner_change_requests
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.cleaners c
      where c.id = cleaner_change_requests.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );
