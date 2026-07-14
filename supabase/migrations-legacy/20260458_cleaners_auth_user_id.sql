-- Explicit link from public.cleaners to Supabase Auth for admin password reset and tooling.
-- cleaners.id may still match auth.users(id) where the original 1:1 design applies; auth_user_id
-- is the canonical user id for auth.admin.updateUserById (supports repair / drift cases).

alter table public.cleaners
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null;

comment on column public.cleaners.auth_user_id is 'Supabase Auth user id for this cleaner; use for admin password updates, never guess from cleaners.id alone.';

create index if not exists cleaners_auth_user_id_idx on public.cleaners (auth_user_id);

create unique index if not exists cleaners_auth_user_id_unique_idx
  on public.cleaners (auth_user_id)
  where auth_user_id is not null;

-- Backfill when the row id already matches an auth user (canonical 1:1 installs).
update public.cleaners c
set auth_user_id = c.id
where c.auth_user_id is null
  and exists (select 1 from auth.users u where u.id = c.id);
