import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { assertBookingCleanerEarningsResetSafe } from "@/lib/admin/adminBookingEarningsResetSafety";
import { logAdminEarningsAction } from "@/lib/admin/logAdminEarningsAction";
import { isAdmin } from "@/lib/auth/admin";
import { resolvePersistCleanerIdForBooking } from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { resetBookingCleanerLineEarnings } from "@/lib/payout/resetBookingCleanerLineEarnings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const forceDisplayRecompute =
    new URL(request.url).searchParams.get("force") === "true" ||
    new URL(request.url).searchParams.get("force") === "1";

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

  const safe = await assertBookingCleanerEarningsResetSafe(admin, bookingId);
  if (!safe.ok) {
    return NextResponse.json({ error: safe.error, code: safe.code }, { status: safe.status });
  }

  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select("cleaner_id, payout_owner_cleaner_id, is_team_job")
    .eq("id", bookingId)
    .maybeSingle();
  if (selErr || !row) {
    return NextResponse.json({ error: selErr?.message ?? "Booking not found." }, { status: 404 });
  }

  const cleanerIdBefore = resolvePersistCleanerIdForBooking(
    row as { cleaner_id?: string | null; payout_owner_cleaner_id?: string | null; is_team_job?: boolean | null },
  );
  if (!cleanerIdBefore) {
    return NextResponse.json(
      { error: "No cleaner or team payout owner on this booking; assign a cleaner first.", code: "no_cleaner" },
      { status: 422 },
    );
  }

  await resetBookingCleanerLineEarnings(admin, bookingId);
  await logAdminEarningsAction(admin, { bookingId, action: "reset", adminUserId });

  const { data: rowAfter, error: afterErr } = await admin
    .from("bookings")
    .select("cleaner_id, payout_owner_cleaner_id, is_team_job")
    .eq("id", bookingId)
    .maybeSingle();
  if (afterErr || !rowAfter) {
    return NextResponse.json(
      {
        ok: false,
        reset: true,
        recomputed: false,
        error: afterErr?.message ?? "Booking missing after reset.",
        warning: "Reset applied but re-fetch failed — run Fix earnings or investigate.",
      },
      { status: 500 },
    );
  }

  const cleanerId = resolvePersistCleanerIdForBooking(
    rowAfter as { cleaner_id?: string | null; payout_owner_cleaner_id?: string | null; is_team_job?: boolean | null },
  );
  if (!cleanerId) {
    return NextResponse.json(
      {
        ok: false,
        reset: true,
        recomputed: false,
        error: "No cleaner assigned after reset; assign a cleaner before recomputing.",
        code: "no_cleaner_after_reset",
        warning: "Line earnings were cleared; persist was not run.",
      },
      { status: 422 },
    );
  }

  const result = await persistCleanerPayoutIfUnset({
    admin,
    bookingId,
    cleanerId,
    ...(forceDisplayRecompute ? { forceDisplayRecompute: true } : {}),
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        reset: true,
        recomputed: false,
        error: result.error,
        warning: "reset applied but recompute failed",
      },
      { status: 500 },
    );
  }

  const recomputed = !result.skipped;

  if (!recomputed) {
    return NextResponse.json({
      ok: true,
      reset: true,
      recomputed: false,
      skipped: true,
      reason: result.skipReason,
    });
  }

  return NextResponse.json({
    ok: true,
    reset: true,
    recomputed: true,
  });
}
