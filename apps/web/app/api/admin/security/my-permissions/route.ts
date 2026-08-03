import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PermissionRow = { permission_code: string };
type AssignmentRow = {
  role_id: string;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};
type RoleRow = { id: string };
type RolePermissionRow = {
  role_id: string;
  admin_permissions:
    | { code?: string | null; is_active?: boolean | null }
    | Array<{ code?: string | null; is_active?: boolean | null }>
    | null;
};

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function permissionFromRelation(
  relation: RolePermissionRow["admin_permissions"],
): string | null {
  const permission = Array.isArray(relation) ? relation[0] : relation;
  return permission?.is_active && permission.code ? permission.code : null;
}

async function loadPermissionsFromTables(
  adminClient: SupabaseClient<any, any, any>,
  userId: string,
): Promise<{ permissions: string[]; error: unknown | null }> {
  const now = Date.now();
  const { data: assignmentsData, error: assignmentsError } = await adminClient
    .from("admin_user_roles")
    .select("role_id, starts_at, expires_at, revoked_at")
    .eq("user_id", userId);

  if (assignmentsError) return { permissions: [], error: assignmentsError };

  const assignments = (assignmentsData ?? []) as AssignmentRow[];
  const candidateRoleIds = [
    ...new Set(
      assignments
        .filter((row) => {
          if (row.revoked_at) return false;
          const startsAt = Date.parse(row.starts_at);
          const expiresAt = row.expires_at ? Date.parse(row.expires_at) : null;
          return startsAt <= now && (expiresAt === null || expiresAt > now);
        })
        .map((row) => row.role_id),
    ),
  ];

  if (candidateRoleIds.length === 0) return { permissions: [], error: null };

  const { data: rolesData, error: rolesError } = await adminClient
    .from("admin_roles")
    .select("id")
    .in("id", candidateRoleIds)
    .eq("is_active", true);

  if (rolesError) return { permissions: [], error: rolesError };
  const activeRoleIds = ((rolesData ?? []) as RoleRow[]).map((row) => row.id);
  if (activeRoleIds.length === 0) return { permissions: [], error: null };

  const { data: permissionData, error: permissionError } = await adminClient
    .from("admin_role_permissions")
    .select("role_id, admin_permissions!inner(code, is_active)")
    .in("role_id", activeRoleIds);

  if (permissionError) return { permissions: [], error: permissionError };

  const permissions = [
    ...new Set(
      ((permissionData ?? []) as unknown as RolePermissionRow[])
        .map((row) => permissionFromRelation(row.admin_permissions))
        .filter((code): code is string => Boolean(code)),
    ),
  ].sort();

  return { permissions, error: null };
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
  const {
    data: { user },
    error: userError,
  } = await publicClient.auth.getUser(token);
  if (userError || !user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const { data, error } = await adminClient.rpc("admin_permission_snapshot", {
    p_target_user_id: user.id,
  });
  if (!error) {
    const rows = Array.isArray(data) ? (data as PermissionRow[]) : [];
    const permissions = [...new Set(rows.map((row) => row.permission_code).filter(Boolean))].sort();
    return NextResponse.json({ userId: user.id, permissions, source: "snapshot" });
  }

  console.warn("RBAC self permission snapshot unavailable; using table fallback", {
    userId: user.id,
    code: error.code,
  });
  const fallback = await loadPermissionsFromTables(adminClient, user.id);
  if (fallback.error) {
    console.error("RBAC self permission fallback failed", { userId: user.id });
    return NextResponse.json({ error: "Authorization unavailable." }, { status: 503 });
  }

  return NextResponse.json({
    userId: user.id,
    permissions: fallback.permissions,
    source: "tables",
  });
}
