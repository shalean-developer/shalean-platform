import { NextResponse } from "next/server";

import { ensureBookingLineItemsForEarningsIfMissing } from "@/lib/booking/ensureBookingLineItemsForEarnings";
import {
  expectedSupabaseRefForDeployment,
  resolveDeploymentEnvironment,
  supabaseRefFromUrl,
} from "@/lib/env/deploymentEnvironment";
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

  const deployment = resolveDeploymentEnvironment();
  const configuredSupabaseRef = supabaseRefFromUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  );
  const expectedSupabaseRef = expectedSupabaseRefForDeployment(deployment);
  if (
    deployment !== "staging" ||
    !configuredSupabaseRef ||
    !expectedSupabaseRef ||
    configuredSupabaseRef !== expectedSupabaseRef
  ) {
    return NextResponse.json({ error: "Staging database identity mismatch." }, { status: 503 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, is_test, booking_source, updated_at, total_paid_zar, amount_paid_cents, base_amount_cents, service_fee_cents")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    return NextResponse.json({ error: bookingError?.message ?? "Booking not found." }, { status: 404 });
  }

  if (booking.is_test !== true) {
    return NextResponse.json({ error: "Fixture booking required." }, { status: 403 });
  }

  const source = String(booking.booking_source ?? "");
  if (source !== "audit_a02_03_fixture") {
    return NextResponse.json(
      {
        error:
          source === "audit_a02_03_fixture_repairing"
            ? "Fixture repair already claimed; create a fresh fixture."
            : "Fixture booking required.",
      },
      { status: source === "audit_a02_03_fixture_repairing" ? 409 : 403 },
    );
  }

  const claimTime = new Date().toISOString();
  let claimQuery = admin
    .from("bookings")
    .update({
      booking_source: "audit_a02_03_fixture_repairing",
      updated_at: claimTime,
    })
    .eq("id", bookingId)
    .eq("is_test", true)
    .eq("booking_source", "audit_a02_03_fixture");

  const { data: claim, error: claimError } = await claimQuery.select("id, updated_at").maybeSingle();

  if (claimError) {
    return NextResponse.json({ ok: false, error: claimError.message }, { status: 500 });
  }
  if (!claim) {
    return NextResponse.json({ ok: false, error: "Fixture repair already claimed." }, { status: 409 });
  }
  const leaseUpdatedAt =
    typeof claim.updated_at === "string" && claim.updated_at.trim() ? claim.updated_at : null;
  if (!leaseUpdatedAt) {
    return NextResponse.json({ ok: false, error: "Fixture repair lease token missing." }, { status: 500 });
  }

  const repaired = await ensureBookingLineItemsForEarningsIfMissing(admin, bookingId);
  if (!repaired.ok) {
    await admin
      .from("bookings")
      .update({ booking_source: "audit_a02_03_fixture" })
      .eq("id", bookingId)
      .eq("booking_source", "audit_a02_03_fixture_repairing")
      .eq("updated_at", leaseUpdatedAt);
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
      .eq("booking_source", "audit_a02_03_fixture_repairing")
      .eq("updated_at", leaseUpdatedAt);
    return NextResponse.json({ ok: false, error: linesError.message }, { status: 500 });
  }

  const rows = lines ?? [];
  const lineTotalCents = rows.reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);
  const cleanerLineCents = rows
    .filter((row) => row.earns_cleaner !== false)
    .reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);

  const exactPaidCents =
    typeof booking.amount_paid_cents === "number" && Number.isFinite(booking.amount_paid_cents)
      ? Math.max(0, Math.round(booking.amount_paid_cents))
      : null;
  const payableFromZarCents =
    typeof booking.total_paid_zar === "number" && Number.isFinite(booking.total_paid_zar)
      ? Math.max(0, Math.round(booking.total_paid_zar * 100))
      : null;
  const expectedPayableCents =
    exactPaidCents != null && exactPaidCents > 0
      ? exactPaidCents
      : payableFromZarCents != null && payableFromZarCents > 0
        ? payableFromZarCents
        : exactPaidCents ?? payableFromZarCents ?? 0;
  const expectedCleanerCents =
    typeof booking.base_amount_cents === "number" && Number.isFinite(booking.base_amount_cents)
      ? Math.max(0, Math.round(booking.base_amount_cents))
      : 0;

  const hasPositiveCleanerLine = rows.some(
    (row) => row.earns_cleaner !== false && Number(row.total_price_cents ?? 0) > 0,
  );
  const validCleanerEvidence = expectedCleanerCents > 0 && cleanerLineCents > 0 && hasPositiveCleanerLine;

  if (
    lineTotalCents !== expectedPayableCents ||
    cleanerLineCents !== expectedCleanerCents ||
    !validCleanerEvidence
  ) {
    await admin
      .from("bookings")
      .update({
        booking_source: "audit_a02_03_fixture_failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .eq("booking_source", "audit_a02_03_fixture_repairing")
      .eq("updated_at", leaseUpdatedAt);
    return NextResponse.json(
      {
        ok: false,
        error: "Repaired ledger did not reconcile.",
        bookingId,
        lineTotalCents,
        expectedPayableCents,
        cleanerLineCents,
        expectedCleanerCents,
        validCleanerEvidence,
        lines: rows,
      },
      { status: 409 },
    );
  }

  const { data: finalized, error: finalizeError } = await admin
    .from("bookings")
    .update({
      booking_source: "audit_a02_03_fixture_repaired",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("booking_source", "audit_a02_03_fixture_repairing")
    .eq("updated_at", leaseUpdatedAt)
    .select("id")
    .maybeSingle();

  if (finalizeError || !finalized) {
    return NextResponse.json(
      { ok: false, error: finalizeError?.message ?? "Could not finalize fixture repair state." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    bookingId,
    lineCount: rows.length,
    lineTotalCents,
    cleanerLineCents,
    lines: rows,
  });
}
