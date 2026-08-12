begin;

-- P0-03B: Row ownership alone is not sufficient authorization for the
-- `cleaners` table. Authenticated cleaners previously held table-level UPDATE
-- and the RLS policy only constrained which row they could update, allowing
-- self-service mutation of admin-owned fields such as status, rating, tier,
-- quality flags, capability flags, priority/acceptance metrics, and auth links.
--
-- Keep the existing row-level ownership policy, but narrow the SQL privilege
-- to the explicitly self-service profile/availability columns. Server-side
-- operational/admin writes continue through service_role and are unaffected.

revoke update on table public.cleaners from authenticated;

grant update (
  full_name,
  email,
  phone,
  phone_number,
  home_lat,
  home_lng,
  latitude,
  longitude,
  location,
  is_available,
  availability_start,
  availability_end,
  availability_weekdays,
  last_active_at
) on table public.cleaners to authenticated;

comment on table public.cleaners is
  'P0-03B RBAC: authenticated self-service UPDATE is column-scoped; admin/system fields remain service-role controlled.';

commit;
