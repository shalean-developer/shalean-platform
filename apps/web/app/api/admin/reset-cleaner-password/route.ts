import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { resetCleanerPasswordForAdmin } from "@/lib/cleaner/adminPassword";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-only cleaner password reset using the service role.
 * Never call `auth.admin` from the browser — clients POST here with the admin session JWT.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: sessionErr,
  } = await pub.auth.getUser(token);

  if (sessionErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: { cleanerId?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const cleanerId = String(body.cleanerId ?? "").trim();
  const password = String(body.password ?? "");
  if (!cleanerId) {
    return NextResponse.json({ error: "Missing cleanerId." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  try {
    await resetCleanerPasswordForAdmin(admin, cleanerId, password);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Password reset failed.";
    const noAuth =
      message.includes("no linked Supabase Auth") ||
      message.includes("linked Supabase Auth account") ||
      message.toLowerCase().includes("user not found");
    const status = message === "Cleaner not found." ? 404 : noAuth ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
