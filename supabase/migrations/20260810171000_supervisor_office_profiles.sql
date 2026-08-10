-- Supervisor Office access is governed by active RBAC assignments. Do not
-- persist the legacy admin profile role, because it could outlive a revoked
-- or expired supervisor assignment and keep fallback Office access enabled.
update public.user_profiles up
set role = null, updated_at = now()
where exists (
  select 1
  from public.admin_user_roles ur
  join public.admin_roles r on r.id = ur.role_id and r.code = 'supervisor'
  where ur.user_id = up.id
);

-- Replace the first migration's helper so future identity links no longer
-- write a legacy role. The link and immutable audit event remain atomic.
create or replace function public.admin_link_supervisor_cleaner(
  p_cleaner_id uuid,
  p_auth_user_id uuid,
  p_actor_id uuid,
  p_email text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_assert_permission(p_actor_id, 'role.manage', null, null);

  insert into public.cleaner_auth_links (
    cleaner_id, auth_user_id, link_type, is_active, linked_by, reason
  ) values (
    p_cleaner_id, p_auth_user_id, 'supervisor', true, p_actor_id, p_reason
  )
  on conflict (cleaner_id, auth_user_id) do update set
    is_active = true,
    link_type = excluded.link_type,
    linked_by = excluded.linked_by,
    reason = excluded.reason,
    updated_at = now();

  insert into public.admin_audit_events (
    actor_user_id, event_type, target_type, target_id, permission_code,
    reason, old_value, new_value, metadata
  ) values (
    p_actor_id, 'cleaner_auth_linked', 'cleaner', p_cleaner_id::text,
    'role.manage', p_reason, null,
    jsonb_build_object('auth_user_id', p_auth_user_id, 'email', p_email),
    jsonb_build_object('link_type', 'supervisor')
  );
end;
$$;

revoke all on function public.admin_link_supervisor_cleaner(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_link_supervisor_cleaner(uuid, uuid, uuid, text, text) to service_role;
