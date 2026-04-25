import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto-assign a cleaner to a pending booking. Admin JWT or CRON_SECRET.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorizationHeader = request.headers.get("authorization");
  const bearerToken = authorizationHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const headerCronSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
  const providedCronToken = bearerToken || headerCronSecret;
  const authCron = !!cronSecret && providedCronToken === cronSecret;

  let bookingId: string | null = null;
  try {
    const body = (await request.json()) as { bookingId?: string };
    bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!bookingId) {
    return NextResponse.json({ error: "bookingId required." }, { status: 400 });
  }

  let allowed = authCron;
  if (!allowed) {
    const token = bearerToken;
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
    } = await pub.auth.getUser(token);
    if (!user?.email || !isAdmin(user.email)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    allowed = true;
  }

  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const result = await ensureBookingAssignment(admin, bookingId, { source: "admin_dispatch_api" });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, message: result.message },
      { status: result.error === "no_candidate" ? 404 : 400 },
    );
  }

  if (result.assignmentKind === "individual") {
    await notifyCleanerAssignedBooking(admin, bookingId, result.cleanerId);
    return NextResponse.json({ ok: true, assignmentKind: "individual", cleanerId: result.cleanerId });
  }
  return NextResponse.json({ ok: true, assignmentKind: "team", teamId: result.teamId });
}
