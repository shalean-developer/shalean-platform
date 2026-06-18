import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveUserRoleServer } from "@/lib/auth/resolveUserRoleServer";
import { dashboardRouteForRole } from "@/lib/auth/userRole";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { access_token?: string };

/**
 * Validates a Supabase access token and returns `user_profiles.role` for post-login routing.
 * Used by login, signup, and client route guards (service role resolves profile server-side).
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

  const uid = userData.user.id;
  const email = userData.user.email;

  try {
    const resolved = await resolveUserRoleServer(admin, { userId: uid, email });
    if (resolved.kind === "missing_profile") {
      return NextResponse.json({ ok: false, missingProfile: true, error: "Profile not found." }, { status: 404 });
    }
    if (resolved.kind === "invalid_role") {
      return NextResponse.json({ ok: false, invalidRole: true, error: "Invalid account role." }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      userId: uid,
      role: resolved.role,
      dashboardRoute: dashboardRouteForRole(resolved.role),
      /** @deprecated use `role` — kept for older clients */
      isCleaner: resolved.role === "cleaner",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Role lookup failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
