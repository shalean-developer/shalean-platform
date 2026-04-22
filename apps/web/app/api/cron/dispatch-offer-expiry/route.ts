import { NextResponse } from "next/server";
import { assignCleanerToBooking } from "@/lib/dispatch/assignCleaner";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const nowIso = new Date().toISOString();
  const { data: expired, error } = await admin
    .from("dispatch_offers")
    .select("id, booking_id, cleaner_id")
    .eq("status", "pending")
    .lt("expires_at", nowIso)
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  for (const row of expired ?? []) {
    const offerId = String((row as { id?: string }).id ?? "");
    const bookingId = String((row as { booking_id?: string }).booking_id ?? "");
    if (!offerId || !bookingId) continue;
    await admin
      .from("dispatch_offers")
      .update({ status: "expired", responded_at: nowIso })
      .eq("id", offerId)
      .eq("status", "pending");
    await assignCleanerToBooking(admin, bookingId, { retryEscalation: 1 });
    processed++;
  }

  return NextResponse.json({ ok: true, processed });
}
