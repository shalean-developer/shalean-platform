-- Ensure cleaners always map to auth.users to prevent auth/foreign-key drift.

delete from public.cleaners c
where not exists (
  select 1 from auth.users u where u.id = c.id
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cleaners_id_auth_users_fkey'
  ) then
    alter table public.cleaners
      add constraint cleaners_id_auth_users_fkey
      foreign key (id) references auth.users(id)
      on delete cascade;
  end if;
end $$;
