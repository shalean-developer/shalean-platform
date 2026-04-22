import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { linkUnlinkedBookingsByEmail } from "@/lib/booking/linkBookingsToUserDb";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Links guest bookings to the authenticated user by email. `userId` / `email` in the body are ignored
 * unless they match the JWT — identity always comes from the Bearer token.
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
    return NextResponse.json({ error: "Auth is not configured." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const tokenEmail = userData.user.email ? normalizeEmail(userData.user.email) : "";
  if (!tokenEmail) {
    return NextResponse.json({ error: "User has no email." }, { status: 400 });
  }

  let body: { email?: unknown; userId?: unknown } = {};
  try {
    body = (await request.json()) as { email?: unknown; userId?: unknown };
  } catch {
    /* optional body */
  }

  if (typeof body.email === "string" && normalizeEmail(body.email) !== tokenEmail) {
    return NextResponse.json({ error: "Email does not match signed-in user." }, { status: 400 });
  }
  if (typeof body.userId === "string" && body.userId.trim() !== userData.user.id) {
    return NextResponse.json({ error: "User id does not match session." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: updated, error: upErr } = await linkUnlinkedBookingsByEmail(
    admin,
    tokenEmail,
    userData.user.id,
  );

  if (upErr) {
    await reportOperationalIssue("error", "bookings/link-user", upErr.message);
    return NextResponse.json({ error: "Could not link bookings." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    linkedCount: Array.isArray(updated) ? updated.length : 0,
  });
}
