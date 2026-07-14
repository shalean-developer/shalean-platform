alter table public.cleaner_payment_details
  add column if not exists account_name text not null default '';

alter table public.cleaner_payment_details enable row level security;

drop policy if exists cleaner_payment_details_select_own on public.cleaner_payment_details;
create policy cleaner_payment_details_select_own on public.cleaner_payment_details
  for select to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_payment_details.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

drop policy if exists cleaner_payment_details_insert_own on public.cleaner_payment_details;
create policy cleaner_payment_details_insert_own on public.cleaner_payment_details
  for insert to authenticated
  with check (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_payment_details.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

drop policy if exists cleaner_payment_details_update_own on public.cleaner_payment_details;
create policy cleaner_payment_details_update_own on public.cleaner_payment_details
  for update to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_payment_details.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_payment_details.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );
