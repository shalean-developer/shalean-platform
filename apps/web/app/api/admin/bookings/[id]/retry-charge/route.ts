import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { refreshRecurringPaymentStateForBooking } from "@/lib/recurring/refreshRecurringPaymentStateForBooking";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ops: make the next `charge-recurring-bookings` cron attempt eligible immediately.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const bookingId = id?.trim();
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: row, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, is_recurring_generated")
    .eq("id", bookingId)
    .maybeSingle();

  if (loadErr || !row) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const st = String((row as { status?: string | null }).status ?? "").trim().toLowerCase();
  const isRec = Boolean((row as { is_recurring_generated?: boolean | null }).is_recurring_generated);
  if (!isRec || st !== "pending_payment") {
    return NextResponse.json(
      { error: "Only recurring-generated bookings in pending_payment can retry charge this way." },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("bookings")
    .update({ recurring_next_charge_attempt_at: nowIso })
    .eq("id", bookingId)
    .eq("status", "pending_payment");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await refreshRecurringPaymentStateForBooking(admin, bookingId);

  await logSystemEvent({
    level: "info",
    source: "admin/bookings/retry-charge",
    message: "retry_charge_requested",
    context: { booking_id: bookingId, admin_id: auth.user.id },
  });

  return NextResponse.json({ ok: true, recurring_next_charge_attempt_at: nowIso });
}
