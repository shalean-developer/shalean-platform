import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated user's bookings (`user_id` = JWT subject). Bearer token required.
 */
export async function GET(request: Request) {
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
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, service, date, time, location, total_paid_zar, amount_paid_cents, currency, status, booking_snapshot, created_at, paystack_reference, cleaner_id, assigned_at, en_route_at, started_at, completed_at",
    )
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    await reportOperationalIssue("error", "api/bookings/me", error.message);
    return NextResponse.json({ error: "Could not load bookings." }, { status: 500 });
  }

  return NextResponse.json({ bookings: data ?? [] });
}
