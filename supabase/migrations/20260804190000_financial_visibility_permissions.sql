insert into public.admin_permissions (code, area, description, is_active)
values
  ('finance.customer_revenue.view', 'finance', 'View customer-paid amounts, revenue metrics and invoice totals.', true),
  ('workforce.cleaner_earnings.view', 'workforce', 'View cleaner earnings and payout amounts within the user effective scope.', true)
on conflict (code) do update
set area = excluded.area,
    description = excluded.description,
    is_active = true;

with grants(role_code, permission_code) as (
  values
    ('owner', 'finance.customer_revenue.view'),
    ('general_manager', 'finance.customer_revenue.view'),
    ('finance_admin', 'finance.customer_revenue.view'),
    ('owner', 'workforce.cleaner_earnings.view'),
    ('general_manager', 'workforce.cleaner_earnings.view'),
    ('finance_admin', 'workforce.cleaner_earnings.view'),
    ('operations_admin', 'workforce.cleaner_earnings.view'),
    ('workforce_admin', 'workforce.cleaner_earnings.view'),
    ('supervisor', 'workforce.cleaner_earnings.view')
)
insert into public.admin_role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.admin_roles r on r.code = g.role_code and r.is_active = true
join public.admin_permissions p on p.code = g.permission_code and p.is_active = true
on conflict do nothing;

select pg_notify('pgrst', 'reload schema');
