-- Profile display name + allow authenticated users to manage their own row (signup upsert)

alter table public.user_profiles add column if not exists full_name text;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
drop policy if exists "user_profiles_insert_own" on public.user_profiles;
drop policy if exists "user_profiles_update_own" on public.user_profiles;

create policy "user_profiles_select_own"
  on public.user_profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "user_profiles_insert_own"
  on public.user_profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "user_profiles_update_own"
  on public.user_profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
