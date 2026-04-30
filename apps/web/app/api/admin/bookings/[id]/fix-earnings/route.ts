import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { logAdminEarningsAction } from "@/lib/admin/logAdminEarningsAction";
import { isAdmin } from "@/lib/auth/admin";
import { resolvePersistCleanerIdForBooking } from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

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
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const adminUserId = typeof user.id === "string" && user.id.trim() ? user.id.trim() : "";
  if (!adminUserId) {
    return NextResponse.json({ error: "Missing admin user id." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select("cleaner_id, payout_owner_cleaner_id, is_team_job")
    .eq("id", bookingId)
    .maybeSingle();
  if (selErr || !row) {
    return NextResponse.json({ error: selErr?.message ?? "Booking not found." }, { status: 404 });
  }

  const cleanerId = resolvePersistCleanerIdForBooking(
    row as { cleaner_id?: string | null; payout_owner_cleaner_id?: string | null; is_team_job?: boolean | null },
  );
  if (!cleanerId) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        skipped: false,
        reason: "no_cleaner_or_payout_owner",
        error: "No cleaner or team payout owner on this booking; assign a cleaner first.",
      },
      { status: 422 },
    );
  }

  const result = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
  await logAdminEarningsAction(admin, { bookingId, action: "fix", adminUserId });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        skipped: false,
        reason: null,
        error: result.error,
      },
      { status: 500 },
    );
  }

  if (!result.skipped) {
    return NextResponse.json({
      ok: true,
      success: true,
      skipped: false,
      reason: undefined,
    });
  }

  return NextResponse.json({
    ok: true,
    success: false,
    skipped: true,
    reason: result.skipReason,
  });
}
