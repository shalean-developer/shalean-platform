import { NextResponse } from "next/server";

import { ensureBookingLineItemsForEarningsIfMissing } from "@/lib/booking/ensureBookingLineItemsForEarnings";
import { resolveDeploymentEnvironment } from "@/lib/env/deploymentEnvironment";
import { isProductionTestRouteBlocked } from "@/lib/security/productionTestRouteGuard";
import { timingSafeEqualString } from "@/lib/security/timingSafeEqualString";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function loadVerifierSecret(): string | null {
  const secret = process.env.DISPATCH_LOAD_TEST_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

export async function POST(request: Request) {
  if (isProductionTestRouteBlocked(request.url) || resolveDeploymentEnvironment() !== "staging") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const secret = loadVerifierSecret();
  if (!secret) {
    return NextResponse.json({ error: "Verifier secret is not configured." }, { status: 503 });
  }
  const provided =
    request.headers.get("x-dispatch-load-test-secret")?.trim() ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    "";
  if (!timingSafeEqualString(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { bookingId?: string } = {};
  try {
    body = (await request.json()) as { bookingId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim().toLowerCase() : "";
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: "Invalid booking id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, is_test, booking_source")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    return NextResponse.json({ error: bookingError?.message ?? "Booking not found." }, { status: 404 });
  }

  if (booking.is_test !== true || booking.booking_source !== "audit_a02_03_fixture") {
    return NextResponse.json({ error: "Fixture booking required." }, { status: 403 });
  }

  const { data: claim, error: claimError } = await admin
    .from("bookings")
    .update({ booking_source: "audit_a02_03_fixture_repairing" })
    .eq("id", bookingId)
    .eq("is_test", true)
    .eq("booking_source", "audit_a02_03_fixture")
    .select("id")
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ ok: false, error: claimError.message }, { status: 500 });
  }
  if (!claim) {
    return NextResponse.json({ ok: false, error: "Fixture repair already claimed." }, { status: 409 });
  }

  const repaired = await ensureBookingLineItemsForEarningsIfMissing(admin, bookingId);
  if (!repaired.ok) {
    await admin
      .from("bookings")
      .update({ booking_source: "audit_a02_03_fixture" })
      .eq("id", bookingId)
      .eq("booking_source", "audit_a02_03_fixture_repairing");
    return NextResponse.json({ ok: false, error: repaired.error }, { status: 500 });
  }

  const { data: lines, error: linesError } = await admin
    .from("booking_line_items")
    .select("item_type, slug, name, total_price_cents, earns_cleaner, pricing_source")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });

  if (linesError) {
    await admin
      .from("bookings")
      .update({ booking_source: "audit_a02_03_fixture" })
      .eq("id", bookingId)
      .eq("booking_source", "audit_a02_03_fixture_repairing");
    return NextResponse.json({ ok: false, error: linesError.message }, { status: 500 });
  }

  const rows = lines ?? [];
  const lineTotalCents = rows.reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);
  const cleanerLineCents = rows
    .filter((row) => row.earns_cleaner !== false)
    .reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);

  await admin
    .from("bookings")
    .update({ booking_source: "audit_a02_03_fixture_repaired" })
    .eq("id", bookingId)
    .eq("booking_source", "audit_a02_03_fixture_repairing");

  return NextResponse.json({
    ok: true,
    bookingId,
    lineCount: rows.length,
    lineTotalCents,
    cleanerLineCents,
    lines: rows,
  });
}
