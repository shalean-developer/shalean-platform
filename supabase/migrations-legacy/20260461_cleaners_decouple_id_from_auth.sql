-- Production model: cleaners.id is a surrogate key (default gen_random_uuid()).
-- Auth is linked ONLY via auth_user_id → auth.users(id). Do not require cleaners.id = auth uid.

alter table public.cleaners drop constraint if exists cleaners_id_auth_users_fkey;

alter table public.cleaners alter column id set default gen_random_uuid();

comment on table public.cleaners is 'Cleaning professionals; link Supabase Auth via auth_user_id only.';
comment on column public.cleaners.id is 'Surrogate row id; not tied to auth.users.';
comment on column public.cleaners.auth_user_id is 'Supabase Auth user id for password login and admin APIs.';
