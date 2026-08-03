import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PermissionRow = { permission_code: string };

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
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

  const { data, error } = await adminClient.rpc("admin_permission_snapshot", { p_target_user_id: user.id });
  if (error) {
    console.error("RBAC self permission snapshot failed", { userId: user.id, code: error.code });
    return NextResponse.json({ error: "Authorization unavailable." }, { status: 503 });
  }

  const rows = Array.isArray(data) ? (data as PermissionRow[]) : [];
  const permissions = [...new Set(rows.map((row) => row.permission_code))].sort();
  return NextResponse.json({ userId: user.id, permissions });
}
