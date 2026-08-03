-- Admin RBAC Phase 2: immutable audit trail and Owner permission inspector.

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  event_type text not null,
  target_type text not null,
  target_id text,
  permission_code text,
  reason text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_idx
  on public.admin_audit_events(created_at desc);
create index if not exists admin_audit_events_actor_idx
  on public.admin_audit_events(actor_user_id, created_at desc);

alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from anon, authenticated;
grant select, insert on public.admin_audit_events to service_role;

-- Audit rows are append-only even for service-role application code.
create or replace function public.prevent_admin_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'admin_audit_events_are_immutable' using errcode = '42501';
end;
$$;

drop trigger if exists admin_audit_events_immutable on public.admin_audit_events;
create trigger admin_audit_events_immutable
before update or delete on public.admin_audit_events
for each row execute function public.prevent_admin_audit_mutation();

create or replace function public.admin_permission_snapshot(p_target_user_id uuid)
returns table (
  user_id uuid,
  email text,
  role_code text,
  role_name text,
  branch_id uuid,
  team_id uuid,
  starts_at timestamptz,
  expires_at timestamptz,
  permission_code text
)
language sql stable security definer set search_path = public, auth as $$
  select
    u.id,
    u.email::text,
    r.code,
    r.name,
    ur.branch_id,
    ur.team_id,
    ur.starts_at,
    ur.expires_at,
    p.code
  from auth.users u
  join public.admin_user_roles ur on ur.user_id = u.id
  join public.admin_roles r on r.id = ur.role_id and r.is_active
  join public.admin_role_permissions rp on rp.role_id = r.id
  join public.admin_permissions p on p.id = rp.permission_id and p.is_active
  where u.id = p_target_user_id
    and ur.revoked_at is null
    and ur.starts_at <= now()
    and (ur.expires_at is null or ur.expires_at > now())
  order by r.name, p.code;
$$;

revoke all on function public.admin_permission_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.admin_permission_snapshot(uuid) to service_role;

comment on table public.admin_audit_events is 'Append-only security and sensitive-action audit trail.';
comment on function public.admin_permission_snapshot is 'Returns active roles, scopes and effective permissions for the Owner security inspector.';
