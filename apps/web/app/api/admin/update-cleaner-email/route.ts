import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { syncCleanerEmailForAdmin } from "@/lib/cleaner/syncCleanerEmail";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keeps `auth.users.email` and `public.cleaners.email` in sync (service role, admin JWT only).
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

  let body: { cleanerId?: string; newEmail?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const cleanerId = String(body.cleanerId ?? "").trim();
  const newEmail = String(body.newEmail ?? "").trim();
  if (!cleanerId) {
    return NextResponse.json({ error: "Missing cleanerId." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  try {
    await syncCleanerEmailForAdmin(admin, cleanerId, newEmail);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Email update failed.";
    const lower = message.toLowerCase();
    const duplicate =
      lower.includes("already been registered") ||
      lower.includes("already registered") ||
      lower.includes("duplicate");
    const status =
      message === "Cleaner not found."
        ? 404
        : duplicate
          ? 409
          : message.includes("not linked") || message.includes("Fix Missing Auth")
            ? 422
            : message.includes("Invalid email") || message.includes("Email is required")
              ? 400
              : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
