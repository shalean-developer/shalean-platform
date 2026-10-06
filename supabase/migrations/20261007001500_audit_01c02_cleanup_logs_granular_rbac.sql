-- AUDIT-01C02: granular RBAC for destructive cleanup-logs operations.
-- system.logs remains read-only. Destructive cleanup requires system.logs.manage.

insert into public.admin_permissions (code, area, description)
values ('system.logs.manage', 'system', 'Delete approved system logs and operational cleanup queues')
on conflict (code) do update set
  area = excluded.area,
  description = excluded.description,
  is_active = true;

-- Owner receives the destructive cleanup permission by default.
-- Other roles remain denied until an explicit audited role-management change.
insert into public.admin_role_permissions (role_id, permission_id)
select r.id, p.id
from public.admin_roles r
join public.admin_permissions p on p.code = 'system.logs.manage'
where r.code = 'owner'
  and r.is_active
  and p.is_active
on conflict do nothing;
