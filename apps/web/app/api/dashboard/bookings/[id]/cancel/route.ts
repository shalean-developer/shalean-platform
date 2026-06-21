import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bookingCustomerKey } from "@/lib/booking/bookingCustomerIdentity";
import {
  loadCustomerBookingRowForUser,
  resolveBookingOwnershipColumn,
} from "@/lib/customer/customerBookingsForUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyCustomerBookingCancelled } from "@/lib/notifications/customerUserNotifications";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { isCustomerCancellableBookingStatus } from "@/lib/dashboard/customerBookingModifyStatuses";
import { expirePendingDispatchOffersForBooking } from "@/lib/dispatch/expirePendingDispatchOffersForBooking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
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

  const userId = userData.user.id;
  const viewerEmail = userData.user.email ?? null;
  const load = await loadCustomerBookingRowForUser(admin, userId, bookingId, { viewerEmail });
  if (!load.ok) {
    return NextResponse.json({ error: load.error }, { status: load.status });
  }

  const row = load.booking;
  const status = String(row.status ?? "").toLowerCase();
  if (!isCustomerCancellableBookingStatus(status)) {
    return NextResponse.json({ error: "This booking cannot be cancelled." }, { status: 400 });
  }

  if (row.started_at) {
    return NextResponse.json({ error: "Cannot cancel after the clean has started." }, { status: 400 });
  }

  const invId = row.monthly_invoice_id;
  if (invId) {
    const { data: inv } = await admin.from("monthly_invoices").select("is_closed").eq("id", invId).maybeSingle();
    const closed = Boolean(inv && typeof inv === "object" && (inv as { is_closed?: boolean }).is_closed);
    if (closed) {
      return NextResponse.json(
        {
          error:
            "This booking sits on a closed billing month and can’t be cancelled online. Please contact support for changes.",
        },
        { status: 409 },
      );
    }
  }

  const { expiredCount, error: offerExpireErr } = await expirePendingDispatchOffersForBooking(admin, bookingId);
  if (offerExpireErr) {
    return NextResponse.json({ error: offerExpireErr }, { status: 500 });
  }

  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const { error: upErr } = await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_by: "customer",
      cleaner_payout_cents: 0,
      cleaner_bonus_cents: 0,
      company_revenue_cents: 0,
      payout_percentage: null,
      payout_type: "cancelled_zero",
    })
    .eq("id", bookingId)
    .eq(ownershipColumn, userId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  void logSystemEvent({
    level: "info",
    source: "customer_booking_cancel",
    message: "Expired pending dispatch offers on customer cancel",
    context: { bookingId, expiredCount },
  });

  void logSystemEvent({
    level: "info",
    source: "customer_booking_cancel",
    message: "Cancelled booking payout set to zero",
    context: { bookingId },
  });

  const custEmail = String(row.customer_email ?? "").trim();
  void notifyBookingEvent({
    type: "cancelled",
    supabase: admin,
    bookingId,
    customerEmail: custEmail,
    serviceLabel: row.service ?? null,
    dateYmd: row.date ?? null,
    timeHm: row.time ?? null,
  });

  const ownerId = bookingCustomerKey(row);
  if (ownerId) {
    void notifyCustomerBookingCancelled(admin, {
      bookingId,
      userId: ownerId,
      serviceLabel: row.service ?? null,
      dateYmd: row.date ?? null,
      timeHm: row.time ?? null,
    });
  }

  return NextResponse.json({ ok: true });
}
