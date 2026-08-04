import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PermissionRow = { permission_code: string };
type AssignmentRow = {
  id: string;
  role_id: string;
  branch_id: string | null;
  team_id: string | null;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};
type RoleRow = { id: string; code: string; name: string };
type RolePermissionRow = {
  role_id: string;
  admin_permissions:
    | { code?: string | null; is_active?: boolean | null }
    | Array<{ code?: string | null; is_active?: boolean | null }>
    | null;
};

type ActiveRole = {
  assignmentId: string;
  roleId: string;
  code: string;
  name: string;
  branchId: string | null;
  teamId: string | null;
  startsAt: string;
  expiresAt: string | null;
};

type AccessProfile = {
  permissions: string[];
  roles: ActiveRole[];
  branchIds: string[];
  teamIds: string[];
};

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function permissionFromRelation(relation: RolePermissionRow["admin_permissions"]): string | null {
  const permission = Array.isArray(relation) ? relation[0] : relation;
  return permission?.is_active && permission.code ? permission.code : null;
}

function isActiveAssignment(row: AssignmentRow, now: number): boolean {
  if (row.revoked_at) return false;
  const startsAt = Date.parse(row.starts_at);
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : null;
  return startsAt <= now && (expiresAt === null || expiresAt > now);
}

async function loadAccessProfile(
  adminClient: SupabaseClient<any, any, any>,
  userId: string,
): Promise<{ profile: AccessProfile; error: unknown | null }> {
  const empty: AccessProfile = { permissions: [], roles: [], branchIds: [], teamIds: [] };
  const now = Date.now();
  const { data: assignmentsData, error: assignmentsError } = await adminClient
    .from("admin_user_roles")
    .select("id, role_id, branch_id, team_id, starts_at, expires_at, revoked_at")
    .eq("user_id", userId);

  if (assignmentsError) return { profile: empty, error: assignmentsError };
  const assignments = ((assignmentsData ?? []) as AssignmentRow[]).filter((row) => isActiveAssignment(row, now));
  const candidateRoleIds = [...new Set(assignments.map((row) => row.role_id))];
  if (candidateRoleIds.length === 0) return { profile: empty, error: null };

  const { data: rolesData, error: rolesError } = await adminClient
    .from("admin_roles")
    .select("id, code, name")
    .in("id", candidateRoleIds)
    .eq("is_active", true);
  if (rolesError) return { profile: empty, error: rolesError };

  const roleRows = (rolesData ?? []) as RoleRow[];
  const rolesById = new Map(roleRows.map((row) => [row.id, row]));
  const activeRoleIds = roleRows.map((row) => row.id);
  if (activeRoleIds.length === 0) return { profile: empty, error: null };

  const { data: permissionData, error: permissionError } = await adminClient
    .from("admin_role_permissions")
    .select("role_id, admin_permissions!inner(code, is_active)")
    .in("role_id", activeRoleIds);
  if (permissionError) return { profile: empty, error: permissionError };

  const permissions = [...new Set(
    ((permissionData ?? []) as unknown as RolePermissionRow[])
      .map((row) => permissionFromRelation(row.admin_permissions))
      .filter((code): code is string => Boolean(code)),
  )].sort();

  const roles: ActiveRole[] = assignments.flatMap((assignment) => {
    const role = rolesById.get(assignment.role_id);
    if (!role) return [];
    return [{
      assignmentId: assignment.id,
      roleId: role.id,
      code: role.code,
      name: role.name,
      branchId: assignment.branch_id,
      teamId: assignment.team_id,
      startsAt: assignment.starts_at,
      expiresAt: assignment.expires_at,
    }];
  });

  return {
    profile: {
      permissions,
      roles,
      branchIds: [...new Set(roles.map((role) => role.branchId).filter((id): id is string => Boolean(id)))],
      teamIds: [...new Set(roles.map((role) => role.teamId).filter((id): id is string => Boolean(id)))],
    },
    error: null,
  };
}

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceRole) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminClient = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await publicClient.auth.getUser(token);
  if (userError || !user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const access = await loadAccessProfile(adminClient, user.id);
  if (access.error) {
    console.error("RBAC self access profile failed", { userId: user.id });
    return NextResponse.json({ error: "Authorization unavailable." }, { status: 503 });
  }

  // Keep the permission snapshot as an integrity check where available.
  const { data, error } = await adminClient.rpc("admin_permission_snapshot", { p_target_user_id: user.id });
  if (!error) {
    const snapshotPermissions = [...new Set(
      (Array.isArray(data) ? (data as PermissionRow[]) : [])
        .map((row) => row.permission_code)
        .filter(Boolean),
    )].sort();
    access.profile.permissions = snapshotPermissions;
  }

  return NextResponse.json({
    userId: user.id,
    ...access.profile,
    source: error ? "tables" : "snapshot+tables",
  });
}
