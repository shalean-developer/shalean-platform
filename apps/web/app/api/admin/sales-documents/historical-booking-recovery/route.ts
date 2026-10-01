import { NextResponse } from "next/server";

import {
  auditHistoricalQuoteBookingRecovery,
  linkHistoricalQuoteBooking,
} from "@/lib/salesDocument/historicalQuoteBookingRecovery";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const rows = await auditHistoricalQuoteBookingRecovery(admin);
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "historical_quote_booking_recovery_failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as {
    confirm?: string;
    invoice_id?: string;
    booking_id?: string;
  };

  if (body.confirm !== "LINK_EXISTING_BOOKING") {
    return NextResponse.json({ error: "Confirmation LINK_EXISTING_BOOKING is required." }, { status: 400 });
  }

  const invoiceId = String(body.invoice_id ?? "").trim();
  const bookingId = String(body.booking_id ?? "").trim();
  if (!invoiceId || !bookingId) {
    return NextResponse.json({ error: "invoice_id and booking_id are required." }, { status: 400 });
  }

  const result = await linkHistoricalQuoteBooking(admin, { invoiceId, bookingId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({ ok: true });
}
