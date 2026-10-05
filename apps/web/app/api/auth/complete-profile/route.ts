import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureUserProfileForAuthUser } from "@/lib/admin/ensureUserProfileForAuthUser";
import { resolveUserRoleServer } from "@/lib/auth/resolveUserRoleServer";
import { dashboardRouteForRole, safePostLoginRedirect } from "@/lib/auth/userRole";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { access_token?: string; redirect?: string | null };

/**
 * Repairs a missing user_profiles row for the currently authenticated auth user.
 * Role inference remains server-authoritative (admin allowlist -> cleaner linkage -> customer).
 */
export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!admin || !url || !anon) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const token = String(body.access_token ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "access_token is required." }, { status: 400 });
  }

  const pub = createClient(url, anon, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: "Invalid or expired token." }, { status: 401 });
  }

  const userId = userData.user.id;
  const repaired = await ensureUserProfileForAuthUser(admin, userId);
  if ("error" in repaired) {
    return NextResponse.json({ ok: false, error: repaired.error }, { status: 500 });
  }

  const resolved = await resolveUserRoleServer(admin, {
    userId,
    email: userData.user.email,
  });
  if (resolved.kind === "missing_profile") {
    return NextResponse.json({ ok: false, error: "Profile repair did not persist." }, { status: 500 });
  }
  if (resolved.kind === "invalid_role") {
    return NextResponse.json({ ok: false, error: "Invalid account role." }, { status: 403 });
  }

  const destination = safePostLoginRedirect(body.redirect, resolved.role);

  return NextResponse.json({
    ok: true,
    created: repaired.created,
    role: resolved.role,
    dashboardRoute: destination || dashboardRouteForRole(resolved.role),
  });
}
