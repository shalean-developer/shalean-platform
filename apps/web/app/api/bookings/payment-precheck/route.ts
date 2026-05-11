import { NextResponse } from "next/server";
import { evaluateBookingPaymentPrecheck } from "@/lib/booking/bookingPaymentPrecheckLogic";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const bookingId = typeof o.bookingId === "string" ? o.bookingId.trim() : "";
  const expectedTotalZar =
    typeof o.expectedTotalZar === "number"
      ? o.expectedTotalZar
      : typeof o.expectedTotalZar === "string"
        ? Number(o.expectedTotalZar)
        : NaN;

  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json({ ok: false, error: "Invalid booking." }, { status: 400 });
  }
  if (!Number.isFinite(expectedTotalZar) || expectedTotalZar <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid amount." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Server unavailable." }, { status: 503 });
  }

  const { data: row, error } = await admin
    .from("bookings")
    .select("id, status, total_price, payment_completed_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    logPaymentStructured("payment_precheck", { booking_id: bookingId, ok: false, reason: "db_error" });
    return NextResponse.json({ ok: false, error: "Could not load booking." }, { status: 503 });
  }

  const r = row as {
    id: string;
    status?: string | null;
    total_price?: number | string | null;
    payment_completed_at?: string | null;
  } | null;

  const evaluated = evaluateBookingPaymentPrecheck(
    r
      ? {
          id: r.id,
          status: r.status ?? null,
          total_price: r.total_price ?? null,
          payment_completed_at: r.payment_completed_at ?? null,
        }
      : null,
    expectedTotalZar,
  );

  if (!evaluated.ok) {
    logPaymentStructured("payment_precheck", {
      booking_id: bookingId,
      ok: false,
      reason: evaluated.reason,
    });
    return NextResponse.json({ ok: false, error: evaluated.error }, { status: evaluated.httpStatus });
  }

  const rowTotal =
    r && r.total_price != null && r.total_price !== "" ? Number(r.total_price) : null;
  logPaymentStructured("payment_precheck", { booking_id: bookingId, ok: true, row_total: rowTotal });
  return NextResponse.json({ ok: true });
}
