import { NextResponse } from "next/server";

import { abandonPendingPaymentForEdit } from "@/lib/booking/abandonPendingPaymentForEdit";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingIdRaw } = await ctx.params;
  const bookingId = bookingIdRaw?.trim() ?? "";
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json(
      { ok: false, code: "BOOKING_NOT_FOUND", error: "Invalid booking." },
      { status: 400 },
    );
  }

  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json(
      { ok: false, code: "BOOKING_ACCESS_DENIED", error: auth.message },
      { status: auth.status },
    );
  }
  if (auth.kind === "anonymous") {
    return NextResponse.json(
      {
        ok: false,
        code: "BOOKING_ACCESS_DENIED",
        error: "Sign in again before editing this saved payment.",
      },
      { status: 401 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, code: "PAYMENT_EDIT_SUPERSEDE_FAILED", error: "Service unavailable." },
      { status: 503 },
    );
  }

  const result = await abandonPendingPaymentForEdit(admin, {
    bookingId,
    userId: auth.userId,
  });

  if (result.ok) {
    return NextResponse.json(result);
  }

  const status =
    result.code === "BOOKING_NOT_FOUND"
      ? 404
      : result.code === "BOOKING_ACCESS_DENIED"
        ? 403
        : result.code === "PAYMENT_ALREADY_COMPLETED" || result.code === "PAYMENT_NOT_EDITABLE"
          ? 409
          : 503;

  return NextResponse.json(result, { status });
}
