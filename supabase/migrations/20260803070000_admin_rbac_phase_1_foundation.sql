-- Shalean Admin RBAC Phase 1 foundation
-- Deny-by-default role and permission model with temporary assignments.

create extension if not exists pgcrypto;

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = lower(code) and code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  is_system boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = lower(code) and code ~ '^[a-z][a-z0-9_.]*$'),
  area text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_role_permissions (
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  permission_id uuid not null references public.admin_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.admin_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  branch_id uuid,
  team_id uuid,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  granted_by uuid references auth.users(id),
  reason text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create unique index if not exists admin_user_roles_active_scope_uidx
  on public.admin_user_roles (
    user_id,
    role_id,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where revoked_at is null;

create index if not exists admin_user_roles_user_active_idx
  on public.admin_user_roles(user_id, starts_at, expires_at)
  where revoked_at is null;

alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_user_roles enable row level security;

revoke all on public.admin_roles from anon, authenticated;
revoke all on public.admin_permissions from anon, authenticated;
revoke all on public.admin_role_permissions from anon, authenticated;
revoke all on public.admin_user_roles from anon, authenticated;

grant all on public.admin_roles to service_role;
grant all on public.admin_permissions to service_role;
grant all on public.admin_role_permissions to service_role;
grant all on public.admin_user_roles to service_role;

insert into public.admin_roles (code, name, description) values
  ('owner', 'Owner', 'Final authority, configuration, audit and approvals.'),
  ('general_manager', 'General Manager', 'Daily operational management with limited financial authority.'),
  ('operations_admin', 'Operations Administrator', 'Booking coordination, scheduling and operational support.'),
  ('finance_admin', 'Finance Administrator', 'Finance, reconciliation, expenses and payout preparation.'),
  ('customer_care', 'Customer Care', 'Customer records, communications, complaints and rescheduling.'),
  ('workforce_admin', 'Workforce Administrator', 'Cleaner onboarding, availability, teams and performance.'),
  ('marketing_admin', 'Marketing Administrator', 'Campaigns, content, SEO and aggregate analytics.'),
  ('supervisor', 'Supervisor', 'Limited access to assigned teams, bookings and own earnings.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

insert into public.admin_permissions (code, area, description) values
  ('booking.view','bookings','View bookings'),
  ('booking.create','bookings','Create bookings'),
  ('booking.edit','bookings','Edit bookings'),
  ('booking.assign','bookings','Assign cleaners or teams'),
  ('booking.cancel','bookings','Cancel bookings'),
  ('booking.export','bookings','Export booking data'),
  ('customer.view','customers','View customer records'),
  ('customer.edit','customers','Edit customer records'),
  ('customer.contact','customers','Contact customers'),
  ('customer.export','customers','Export customer data'),
  ('cleaner.view','workforce','View cleaner records'),
  ('cleaner.edit','workforce','Edit cleaner records'),
  ('cleaner.documents.view','workforce','View cleaner documents'),
  ('cleaner.bank.view','workforce','View cleaner bank details'),
  ('team.view','workforce','View teams'),
  ('team.assign','workforce','Assign cleaners to teams'),
  ('team.manage','workforce','Create and edit teams'),
  ('application.decide','workforce','Approve or reject applications'),
  ('finance.summary.view','finance','View summary financial metrics'),
  ('finance.full.view','finance','View detailed company financials'),
  ('expense.manage','finance','Manage expenses'),
  ('invoice.manage','finance','Manage invoices'),
  ('payment.reconcile','finance','Reconcile payments'),
  ('profit.view','finance','View profitability'),
  ('payout.view','payouts','View payouts'),
  ('payout.prepare','payouts','Prepare payout batches'),
  ('payout.approve','payouts','Approve payout batches'),
  ('payout.release','payouts','Release payouts'),
  ('refund.request','refunds','Request refunds'),
  ('refund.approve.low','refunds','Approve refunds within low threshold'),
  ('refund.approve.high','refunds','Approve high-value refunds'),
  ('marketing.view','growth','View marketing data'),
  ('content.draft','growth','Draft content'),
  ('content.publish','growth','Publish content'),
  ('notification.send','operations','Send operational notifications'),
  ('template.manage','operations','Manage templates'),
  ('incident.manage','operations','Manage incidents'),
  ('dispute.resolve','operations','Resolve disputes'),
  ('ops.health.view','operations','View operational health'),
  ('user.manage','administration','Manage admin users'),
  ('role.manage','administration','Manage roles and permissions'),
  ('pricing.manage','administration','Manage pricing'),
  ('integration.manage','administration','Manage integrations'),
  ('audit.view','administration','View audit records'),
  ('bulk_export.approve','administration','Approve sensitive bulk exports'),
  ('branch.view','scope','View assigned branch'),
  ('branch.manage','scope','Manage branches'),
  ('system.settings','system','Manage system settings'),
  ('system.notifications','system','Manage notification configuration'),
  ('system.integrations','system','Manage system integrations'),
  ('system.logs','system','View system logs')
on conflict (code) do update set
  area = excluded.area,
  description = excluded.description,
  is_active = true;

-- Owner receives every permission. Other bundles are intentionally conservative
-- and can be expanded only through an audited role-management workflow.
insert into public.admin_role_permissions (role_id, permission_id)
select r.id, p.id
from public.admin_roles r cross join public.admin_permissions p
where r.code = 'owner'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select r.id, p.id from public.admin_roles r join public.admin_permissions p on p.code = any(array[
  'booking.view','booking.create','booking.edit','booking.assign','booking.cancel',
  'customer.view','customer.edit','customer.contact','cleaner.view','cleaner.edit',
  'team.view','team.assign','team.manage','finance.summary.view','payout.view','payout.prepare',
  'refund.request','refund.approve.low','notification.send','incident.manage','dispute.resolve','ops.health.view','branch.view'
]) where r.code = 'general_manager'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select r.id, p.id from public.admin_roles r join public.admin_permissions p on p.code = any(array[
  'booking.view','booking.create','booking.edit','booking.assign','booking.cancel',
  'customer.view','customer.edit','customer.contact','cleaner.view','team.view','team.assign',
  'refund.request','notification.send','incident.manage','ops.health.view','branch.view'
]) where r.code = 'operations_admin'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select r.id, p.id from public.admin_roles r join public.admin_permissions p on p.code = any(array[
  'finance.summary.view','finance.full.view','expense.manage','invoice.manage','payment.reconcile','profit.view',
  'payout.view','payout.prepare','refund.request','branch.view'
]) where r.code = 'finance_admin'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select r.id, p.id from public.admin_roles r join public.admin_permissions p on p.code = any(array[
  'booking.view','booking.edit','customer.view','customer.edit','customer.contact','refund.request','incident.manage','branch.view'
]) where r.code = 'customer_care'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select r.id, p.id from public.admin_roles r join public.admin_permissions p on p.code = any(array[
  'cleaner.view','cleaner.edit','cleaner.documents.view','team.view','team.assign','team.manage','application.decide','branch.view'
]) where r.code = 'workforce_admin'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select r.id, p.id from public.admin_roles r join public.admin_permissions p on p.code = any(array[
  'marketing.view','content.draft','branch.view'
]) where r.code = 'marketing_admin'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select r.id, p.id from public.admin_roles r join public.admin_permissions p on p.code = any(array[
  'booking.view','booking.assign','cleaner.view','team.view','team.assign','incident.manage'
]) where r.code = 'supervisor'
on conflict do nothing;

create or replace function public.admin_has_permission(
  p_user_id uuid,
  p_permission text,
  p_branch_id uuid default null,
  p_team_id uuid default null,
  p_at timestamptz default now()
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_user_roles ur
    join public.admin_roles r on r.id = ur.role_id and r.is_active
    join public.admin_role_permissions rp on rp.role_id = r.id
    join public.admin_permissions p on p.id = rp.permission_id and p.is_active
    where ur.user_id = p_user_id
      and ur.revoked_at is null
      and ur.starts_at <= p_at
      and (ur.expires_at is null or ur.expires_at > p_at)
      and p.code = lower(trim(p_permission))
      and (ur.branch_id is null or ur.branch_id = p_branch_id)
      and (ur.team_id is null or ur.team_id = p_team_id)
  );
$$;

revoke all on function public.admin_has_permission(uuid,text,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_has_permission(uuid,text,uuid,uuid,timestamptz) to service_role;

create or replace function public.admin_assert_permission(
  p_user_id uuid,
  p_permission text,
  p_branch_id uuid default null,
  p_team_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_has_permission(p_user_id, p_permission, p_branch_id, p_team_id, now()) then
    raise exception 'permission_denied:%', p_permission using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.admin_assert_permission(uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_assert_permission(uuid,text,uuid,uuid) to service_role;

-- Role grants and revocations must go through this function. It prevents users
-- changing their own role assignments and requires role.manage for the actor.
create or replace function public.admin_grant_role(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_role_code text,
  p_branch_id uuid default null,
  p_team_id uuid default null,
  p_expires_at timestamptz default null,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_assignment_id uuid;
begin
  if p_actor_id = p_target_user_id then
    raise exception 'self_role_edit_forbidden' using errcode = '42501';
  end if;
  perform public.admin_assert_permission(p_actor_id, 'role.manage', p_branch_id, p_team_id);
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'temporary_access_expiry_must_be_future' using errcode = '22023';
  end if;
  select id into v_role_id from public.admin_roles where code = lower(trim(p_role_code)) and is_active;
  if v_role_id is null then raise exception 'unknown_or_inactive_role:%', p_role_code using errcode = '22023'; end if;
  insert into public.admin_user_roles(user_id, role_id, branch_id, team_id, expires_at, granted_by, reason)
  values (p_target_user_id, v_role_id, p_branch_id, p_team_id, p_expires_at, p_actor_id, nullif(trim(p_reason), ''))
  returning id into v_assignment_id;
  return v_assignment_id;
end;
$$;

create or replace function public.admin_revoke_role(
  p_actor_id uuid,
  p_assignment_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_user_id uuid;
  v_branch_id uuid;
  v_team_id uuid;
begin
  select user_id, branch_id, team_id into v_target_user_id, v_branch_id, v_team_id
  from public.admin_user_roles where id = p_assignment_id and revoked_at is null for update;
  if v_target_user_id is null then raise exception 'active_role_assignment_not_found' using errcode = 'P0002'; end if;
  if p_actor_id = v_target_user_id then raise exception 'self_role_edit_forbidden' using errcode = '42501'; end if;
  perform public.admin_assert_permission(p_actor_id, 'role.manage', v_branch_id, v_team_id);
  update public.admin_user_roles
  set revoked_at = now(), revoked_by = p_actor_id,
      reason = coalesce(nullif(trim(p_reason), ''), reason), updated_at = now()
  where id = p_assignment_id;
end;
$$;

revoke all on function public.admin_grant_role(uuid,uuid,text,uuid,uuid,timestamptz,text) from public, anon, authenticated;
revoke all on function public.admin_revoke_role(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_grant_role(uuid,uuid,text,uuid,uuid,timestamptz,text) to service_role;
grant execute on function public.admin_revoke_role(uuid,uuid,text) to service_role;

comment on table public.admin_user_roles is 'Time-bounded, scoped admin role assignments. Missing or expired assignments grant no permissions.';
comment on function public.admin_has_permission is 'Central deny-by-default permission evaluator for server-side authorization.';
