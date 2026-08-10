-- Ensure every active supervisor has an Office profile, including identities
-- that never had a customer profile row before becoming a supervisor.
insert into public.user_profiles (id, role, updated_at)
select distinct ur.user_id, 'admin', now()
from public.admin_user_roles ur
join public.admin_roles r
  on r.id = ur.role_id
 and r.code = 'supervisor'
 and r.is_active
where ur.revoked_at is null
  and ur.starts_at <= now()
  and (ur.expires_at is null or ur.expires_at > now())
on conflict (id) do update set
  role = 'admin',
  updated_at = now();
