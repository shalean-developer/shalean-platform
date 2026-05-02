import { NextResponse } from "next/server";
import { findBookingIdStatusForPaystackReference } from "@/lib/booking/paystackBookingIdLookup";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only: resolve booking id + lifecycle status from Paystack charge reference (or booking UUID).
 * Does not call Paystack or finalize — use after `/api/payments/verify` or `/api/paystack/verify` has run.
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

  return NextResponse.json({
    bookingId: row.bookingId,
    status: row.status,
  });
}
