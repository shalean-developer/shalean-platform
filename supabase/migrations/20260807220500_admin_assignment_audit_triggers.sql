-- Priority 4: immutable audit coverage for role and scope assignment changes.
-- These tables control Office authorization, temporary access and Supervisor scope.

create or replace function public.audit_admin_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_actor uuid;
  v_reason text;
  v_target_id text;
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    v_old := null;
    v_new := to_jsonb(new);
    v_actor := new.granted_by;
    v_reason := new.reason;
    v_target_id := new.id::text;
    v_event_type := 'admin_assignment_granted';
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_actor := coalesce(new.revoked_by, new.granted_by, old.revoked_by, old.granted_by);
    v_reason := coalesce(new.reason, old.reason);
    v_target_id := new.id::text;
    if old.revoked_at is null and new.revoked_at is not null then
      v_event_type := 'admin_assignment_revoked';
    elsif old.expires_at is distinct from new.expires_at then
      v_event_type := 'admin_assignment_expiry_changed';
    else
      v_event_type := 'admin_assignment_updated';
    end if;
  else
    v_old := to_jsonb(old);
    v_new := null;
    v_actor := coalesce(old.revoked_by, old.granted_by);
    v_reason := old.reason;
    v_target_id := old.id::text;
    v_event_type := 'admin_assignment_deleted';
  end if;

  insert into public.admin_audit_events (
    actor_user_id,
    event_type,
    target_type,
    target_id,
    permission_code,
    reason,
    old_value,
    new_value,
    metadata
  ) values (
    v_actor,
    v_event_type,
    tg_table_name,
    v_target_id,
    'role.manage',
    v_reason,
    v_old,
    v_new,
    jsonb_build_object('operation', tg_op, 'source', 'database_trigger')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_admin_assignment_change() from public;

-- Recreate idempotently so environments can safely replay the governed migration.
drop trigger if exists audit_admin_user_roles_change on public.admin_user_roles;
create trigger audit_admin_user_roles_change
after insert or update or delete on public.admin_user_roles
for each row execute function public.audit_admin_assignment_change();

drop trigger if exists audit_admin_branch_assignments_change on public.admin_branch_assignments;
create trigger audit_admin_branch_assignments_change
after insert or update or delete on public.admin_branch_assignments
for each row execute function public.audit_admin_assignment_change();

drop trigger if exists audit_admin_team_assignments_change on public.admin_team_assignments;
create trigger audit_admin_team_assignments_change
after insert or update or delete on public.admin_team_assignments
for each row execute function public.audit_admin_assignment_change();
