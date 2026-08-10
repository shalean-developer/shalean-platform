-- Baseline audit evidence for authorization assignments that existed before
-- database assignment-change triggers were installed.
--
-- This intentionally does NOT create admin_access_reviews rows: a review row is
-- an Owner decision (keep/change/revoke) and must not be fabricated by migration.

insert into public.admin_audit_events (
  actor_user_id,
  event_type,
  target_type,
  target_id,
  permission_code,
  reason,
  old_value,
  new_value,
  metadata,
  created_at
)
select
  aur.granted_by,
  'admin_assignment_baseline_observed',
  'admin_user_roles',
  aur.id::text,
  'role.manage',
  coalesce(aur.reason, 'Baseline audit created for assignment predating governed audit history.'),
  null,
  to_jsonb(aur),
  jsonb_build_object(
    'source', 'baseline_backfill',
    'historical_action_inferred', false,
    'assignment_created_at', aur.created_at
  ),
  now()
from public.admin_user_roles aur
where not exists (
  select 1
  from public.admin_audit_events aae
  where aae.target_type = 'admin_user_roles'
    and aae.target_id = aur.id::text
);

comment on table public.admin_access_reviews is
  'Immutable Owner access-review history for admin_user_roles assignments. Missing latest review means an active assignment is review-due; migrations must not fabricate review outcomes.';
