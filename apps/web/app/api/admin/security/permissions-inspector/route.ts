import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";

export const dynamic = "force-dynamic";

type PermissionSnapshotRow = {
  permission_code: string;
  role_code: string;
  role_name: string;
  branch_id: string | null;
  team_id: string | null;
  starts_at: string;
  expires_at: string | null;
};

type RoleSnapshot = {
  key: string;
  code: string;
  name: string;
  branchId: string | null;
  teamId: string | null;
  startsAt: string;
  expiresAt: string | null;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "role.manage");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const supabase = adminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) {
    return NextResponse.json({ error: "User lookup failed." }, { status: 503 });
  }

  const target = users.users.find((user) => user.email?.toLowerCase() === email);
  if (!target) {
    return NextResponse.json({ error: "Admin user not found." }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("admin_permission_snapshot", {
    p_target_user_id: target.id,
  });
  if (error) {
    return NextResponse.json({ error: "Permission snapshot unavailable." }, { status: 503 });
  }

  const rows: PermissionSnapshotRow[] = Array.isArray(data)
    ? (data as PermissionSnapshotRow[])
    : [];
  const permissions = [...new Set(rows.map((row) => row.permission_code))].sort();
  const roles = rows.reduce<RoleSnapshot[]>((result, row) => {
    const key = `${row.role_code}:${row.branch_id ?? "global"}:${row.team_id ?? "global"}`;
    if (!result.some((item) => item.key === key)) {
      result.push({
        key,
        code: row.role_code,
        name: row.role_name,
        branchId: row.branch_id,
        teamId: row.team_id,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
      });
    }
    return result;
  }, []);

  await supabase.from("admin_audit_events").insert({
    actor_user_id: auth.user.id,
    event_type: "permission_snapshot_viewed",
    target_type: "admin_user",
    target_id: target.id,
    permission_code: "role.manage",
    metadata: { targetEmail: email },
  });

  return NextResponse.json({
    user: { id: target.id, email: target.email },
    roles: roles.map(({ key: _key, ...role }) => role),
    permissions,
  });
}
