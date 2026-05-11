import { parseWidgetDraftCreateBody } from "@/lib/booking/bookingWidgetDraft";
import { insertWidgetDraftBookingRow } from "@/lib/booking/insertWidgetServerBooking";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Persists a homepage-widget draft `bookings` row with ownership anchors when available:
 * authenticated callers set `user_id`; `customer_email` is set from verified session email,
 * or from body email when guest / when auth email is absent (never sets `user_id` from email alone).
 */
export async function POST(req: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json({ ok: false, error: "Server unavailable." }, { status: 503 });
  }

  const auth = await resolveBookingRouteBearerAuth(req);
  if (auth.kind === "invalid_token") {
    return Response.json({ ok: false, error: auth.message }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid or missing JSON body." }, { status: 400 });
  }

  const { intake, guestEmail } = parseWidgetDraftCreateBody(body);
  if (!intake) {
    return Response.json({ ok: false, error: "Invalid widget intake payload." }, { status: 400 });
  }

  const ownership =
    auth.kind === "authenticated"
      ? {
          authUserId: auth.userId,
          authEmail: auth.email,
          guestEmail,
        }
      : { guestEmail };

  const result = await insertWidgetDraftBookingRow(admin, intake, ownership);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  return Response.json({
    ok: true,
    bookingId: result.bookingId,
    paystackReference: result.paystackReference,
    totalPaidZar: result.totalPaidZar,
  });
}
