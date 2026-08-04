-- Assign and verify the protected Owner recovery account.
-- This migration intentionally fails if the expected auth user is missing so
-- production cannot continue with protected RBAC routes and no recovery owner.

do $$
declare
  v_owner_user_id uuid;
  v_owner_role_id uuid;
  v_assignment_id uuid;
begin
  select id
    into v_owner_user_id
    from auth.users
   where lower(email) = 'farai@shalean.com'
   order by created_at asc
   limit 1;

  if v_owner_user_id is null then
    raise exception 'RBAC owner recovery account farai@shalean.com was not found in auth.users';
  end if;

  select id
    into v_owner_role_id
    from public.admin_roles
   where code = 'owner'
     and is_active = true
   limit 1;

  if v_owner_role_id is null then
    raise exception 'RBAC owner role is missing or inactive';
  end if;

  select id
    into v_assignment_id
    from public.admin_user_roles
   where user_id = v_owner_user_id
     and role_id = v_owner_role_id
     and branch_id is null
     and team_id is null
     and revoked_at is null
   limit 1;

  if v_assignment_id is null then
    insert into public.admin_user_roles (
      user_id,
      role_id,
      branch_id,
      team_id,
      starts_at,
      expires_at,
      granted_by,
      reason
    ) values (
      v_owner_user_id,
      v_owner_role_id,
      null,
      null,
      now(),
      null,
      v_owner_user_id,
      'Protected Owner recovery account bootstrap'
    )
    returning id into v_assignment_id;
  end if;

  if not public.admin_has_permission(v_owner_user_id, 'role.manage', null, null, now()) then
    raise exception 'RBAC owner recovery verification failed: role.manage not resolved';
  end if;

  if not public.admin_has_permission(v_owner_user_id, 'payout.release', null, null, now()) then
    raise exception 'RBAC owner recovery verification failed: payout.release not resolved';
  end if;

  if to_regclass('public.admin_audit_events') is not null then
    insert into public.admin_audit_events (
      actor_user_id,
      event_type,
      target_type,
      target_id,
      permission_code,
      metadata
    ) values (
      v_owner_user_id,
      'owner_recovery_verified',
      'admin_user',
      v_owner_user_id,
      'role.manage',
      jsonb_build_object(
        'email', 'farai@shalean.com',
        'assignmentId', v_assignment_id,
        'globalScope', true
      )
    );
  end if;
end
$$;
