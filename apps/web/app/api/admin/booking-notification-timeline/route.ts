import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { fetchBookingNotificationTimeline, isNotificationTimelineBookingId } from "@/lib/admin/notificationMonitoring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-booking chronological notification-related `system_logs` rows (debugging). */
export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const bookingId = new URL(req.url).searchParams.get("bookingId")?.trim() ?? "";
  if (!bookingId) {
    return NextResponse.json({ error: "Missing bookingId." }, { status: 400 });
  }
  if (!isNotificationTimelineBookingId(bookingId)) {
    return NextResponse.json({ error: "Invalid bookingId." }, { status: 400 });
  }

  const { entries, unstable } = await fetchBookingNotificationTimeline(admin, bookingId);
  return NextResponse.json({ bookingId, entries, unstable });
}
