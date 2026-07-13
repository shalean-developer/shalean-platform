-- App role for post-login routing (maps to profiles.role in product spec; stored on user_profiles).

alter table public.user_profiles
  add column if not exists role text
    check (role is null or role in ('admin', 'cleaner', 'customer'));

comment on column public.user_profiles.role is
  'Primary app role for dashboard routing: admin → /office, cleaner → /jobs, customer → /account.';

create index if not exists user_profiles_role_idx on public.user_profiles (role);
