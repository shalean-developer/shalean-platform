import { NextResponse } from "next/server";
import { normalizePricingSummary } from "@/lib/booking-v2/types";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: bookingIdRaw } = await ctx.params;
  const bookingId = bookingIdRaw?.trim() ?? "";
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json(
      { error: "Invalid booking." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind !== "authenticated") {
    return NextResponse.json(
      {
        error:
          auth.kind === "invalid_token"
            ? auth.message
            : "Sign in to continue payment.",
      },
      {
        status: auth.kind === "invalid_token" ? auth.status : 401,
        headers: NO_STORE_HEADERS,
      },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Service unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const { data, error } = await admin
    .from("bookings")
    .select(
      `id, status, payment_status, payment_completed_at, total_price, total_paid_zar, amount_paid_cents, pricing_summary, booking_snapshot, booking_reference, paystack_reference, service, service_slug, location, suburb, ${ownershipColumn}`,
    )
    .eq("id", bookingId)
    .eq(ownershipColumn, auth.userId)
    .maybeSingle();

  if (error) {
    console.error("[payment-summary] booking lookup failed", {
      bookingId,
      message: error.message,
    });
    return NextResponse.json(
      { error: "Could not load the saved booking." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "Saved booking not found." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const amountZar = Math.round(Number(data.total_price));
  if (!Number.isFinite(amountZar) || amountZar < 0) {
    return NextResponse.json(
      { error: "The saved booking total is unavailable." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  const normalized = normalizePricingSummary(data.pricing_summary);
  const pricingSummary = normalized
    ? { ...normalized, estimated_total: amountZar, total: amountZar }
    : null;

  const normalizedPaymentStatus = String(data.payment_status ?? "").trim().toLowerCase();
  const paid =
    Boolean(data.payment_completed_at) ||
    normalizedPaymentStatus === "paid" ||
    normalizedPaymentStatus === "success";
  const amountPaidCents = Number(data.amount_paid_cents);
  const totalPaidZar = Number(data.total_paid_zar);

  return NextResponse.json(
    {
      bookingId,
      status: String(data.status ?? ""),
      paymentStatus: String(data.payment_status ?? ""),
      paid,
      amountPaidCents:
        paid && Number.isFinite(amountPaidCents) && amountPaidCents >= 0
          ? Math.round(amountPaidCents)
          : null,
      totalPaidZar:
        paid && Number.isFinite(totalPaidZar) && totalPaidZar >= 0
          ? totalPaidZar
          : null,
      bookingReference: String(data.booking_reference ?? "") || null,
      paystackReference: String(data.paystack_reference ?? "") || null,
      bookingSnapshot: data.booking_snapshot ?? null,
      serviceLabel: String(
        data.service ?? data.service_slug ?? "Cleaning service",
      ),
      address: String(data.location ?? data.suburb ?? ""),
      amountZar,
      pricingSummary,
    },
    { headers: NO_STORE_HEADERS },
  );
}
