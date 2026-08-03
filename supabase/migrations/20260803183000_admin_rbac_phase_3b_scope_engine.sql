-- Shalean Admin RBAC Phase 3B: effective branch/team data scope foundation.

create table if not exists public.admin_branch_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid not null,
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

create table if not exists public.admin_team_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null,
  branch_id uuid,
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

create unique index if not exists admin_branch_assignments_active_uidx
  on public.admin_branch_assignments(user_id, branch_id)
  where revoked_at is null;

create unique index if not exists admin_team_assignments_active_uidx
  on public.admin_team_assignments(user_id, team_id)
  where revoked_at is null;

create index if not exists admin_branch_assignments_user_active_idx
  on public.admin_branch_assignments(user_id, starts_at, expires_at)
  where revoked_at is null;

create index if not exists admin_team_assignments_user_active_idx
  on public.admin_team_assignments(user_id, starts_at, expires_at)
  where revoked_at is null;

alter table public.admin_branch_assignments enable row level security;
alter table public.admin_team_assignments enable row level security;
revoke all on public.admin_branch_assignments from anon, authenticated;
revoke all on public.admin_team_assignments from anon, authenticated;
grant all on public.admin_branch_assignments to service_role;
grant all on public.admin_team_assignments to service_role;

create or replace function public.admin_effective_scope_snapshot(
  p_target_user_id uuid,
  p_at timestamptz default now()
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active_roles as (
    select distinct r.code, ur.branch_id, ur.team_id
    from public.admin_user_roles ur
    join public.admin_roles r on r.id = ur.role_id and r.is_active
    where ur.user_id = p_target_user_id
      and ur.revoked_at is null
      and ur.starts_at <= p_at
      and (ur.expires_at is null or ur.expires_at > p_at)
  ), effective_permissions as (
    select distinct p.code
    from public.admin_user_roles ur
    join public.admin_roles r on r.id = ur.role_id and r.is_active
    join public.admin_role_permissions rp on rp.role_id = r.id
    join public.admin_permissions p on p.id = rp.permission_id and p.is_active
    where ur.user_id = p_target_user_id
      and ur.revoked_at is null
      and ur.starts_at <= p_at
      and (ur.expires_at is null or ur.expires_at > p_at)
  ), effective_branches as (
    select branch_id from public.admin_branch_assignments
    where user_id = p_target_user_id
      and revoked_at is null
      and starts_at <= p_at
      and (expires_at is null or expires_at > p_at)
    union
    select branch_id from active_roles where branch_id is not null
  ), effective_teams as (
    select team_id from public.admin_team_assignments
    where user_id = p_target_user_id
      and revoked_at is null
      and starts_at <= p_at
      and (expires_at is null or expires_at > p_at)
    union
    select team_id from active_roles where team_id is not null
  ), owner_state as (
    select exists(select 1 from active_roles where code = 'owner') as is_owner
  )
  select jsonb_build_object(
    'userId', p_target_user_id,
    'isOwner', owner_state.is_owner,
    'roles', coalesce((select jsonb_agg(code order by code) from (select distinct code from active_roles) x), '[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(code order by code) from effective_permissions), '[]'::jsonb),
    'branches', case when owner_state.is_owner then jsonb_build_array('*') else coalesce((select jsonb_agg(branch_id::text order by branch_id::text) from effective_branches), '[]'::jsonb) end,
    'teams', case when owner_state.is_owner then jsonb_build_array('*') else coalesce((select jsonb_agg(team_id::text order by team_id::text) from effective_teams), '[]'::jsonb) end,
    'resolvedAt', p_at
  )
  from owner_state;
$$;

revoke all on function public.admin_effective_scope_snapshot(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_effective_scope_snapshot(uuid,timestamptz) to service_role;
