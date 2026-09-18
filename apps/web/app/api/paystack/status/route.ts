import { NextResponse } from "next/server";
import { findBookingIdStatusForPaystackReference } from "@/lib/booking/paystackBookingIdLookup";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * **Responsibility:** Read-only DB lookup by Paystack reference / internal id — **no** Paystack HTTP call and **no** finalize.
 * Use after payment resolution through the canonical `/api/paystack/verify` or webhook flow.
 * See `lib/booking/paystackRouteResponsibilityContract.ts`.
 */
export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server unavailable." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const reference = (searchParams.get("reference") ?? searchParams.get("trxref") ?? "").trim();
  if (!reference) {
    return NextResponse.json({ error: "Missing reference." }, { status: 400 });
  }

  const row = await findBookingIdStatusForPaystackReference(admin, reference);
  if (!row) {
    return NextResponse.json({ bookingId: null, status: "unknown" });
  }

  const requestedBookingId = searchParams.get("bookingId")?.trim() ?? "";
  if (!requestedBookingId || requestedBookingId !== row.bookingId) {
    return NextResponse.json({
      bookingId: row.bookingId,
      status: row.status,
    });
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      "id, status, payment_status, payment_completed_at, total_price, total_paid_zar, amount_paid_cents, booking_reference, paystack_reference, service, service_slug",
    )
    .eq("id", requestedBookingId)
    .eq("paystack_reference", reference)
    .maybeSingle();

  if (error || !booking) {
    return NextResponse.json({
      bookingId: row.bookingId,
      status: row.status,
    });
  }

  const paymentStatus = String(booking.payment_status ?? "").trim().toLowerCase();
  const paid =
    Boolean(booking.payment_completed_at) ||
    paymentStatus === "paid" ||
    paymentStatus === "success";

  return NextResponse.json({
    bookingId: row.bookingId,
    status: row.status,
    confirmation: {
      bookingId: booking.id,
      paid,
      amountZar: Number(booking.total_price ?? 0),
      amountPaidCents: Number.isFinite(Number(booking.amount_paid_cents))
        ? Number(booking.amount_paid_cents)
        : null,
      totalPaidZar: Number.isFinite(Number(booking.total_paid_zar))
        ? Number(booking.total_paid_zar)
        : null,
      bookingReference: String(booking.booking_reference ?? "") || null,
      paystackReference: String(booking.paystack_reference ?? "") || null,
      bookingSnapshot: {
        total_zar: Number(booking.total_paid_zar ?? booking.total_price ?? 0),
        flat: {
          service: String(booking.service ?? booking.service_slug ?? "Cleaning service"),
        },
      },
      serviceLabel: String(booking.service ?? booking.service_slug ?? "Cleaning service"),
    },
  });
}
