-- Backfill user_profiles.role = 'customer' where unset, excluding cleaner-linked auth users.
-- Admin and cleaner roles are left unchanged.

update public.user_profiles up
set
  role = 'customer',
  updated_at = now()
where up.role is null
  and not exists (
    select 1
    from public.cleaners c
    where c.auth_user_id = up.id
  );

comment on column public.user_profiles.role is
  'Primary app role: admin → /office, cleaner → /jobs, customer → /account. New profiles default to customer.';
