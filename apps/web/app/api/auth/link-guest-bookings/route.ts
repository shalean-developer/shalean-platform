import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { linkUnlinkedBookingsByEmail } from "@/lib/booking/linkBookingsToUserDb";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Attach `user_id` to guest rows for this email after magic-link / OTP sign-in.
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
  if (userErr || !userData.user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const email = normalizeEmail(userData.user.email);
  const userId = userData.user.id;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: updated, error: upErr } = await linkUnlinkedBookingsByEmail(admin, email, userId);

  if (upErr) {
    await reportOperationalIssue("error", "link-guest-bookings", upErr.message);
    return NextResponse.json({ error: "Could not link bookings." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    linkedCount: Array.isArray(updated) ? updated.length : 0,
  });
}
