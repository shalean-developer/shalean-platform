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

const repairLocks = new Map<string, Promise<void>>();

async function withBookingRepairLock<T>(bookingId: string, task: () => Promise<T>): Promise<T> {
  const prior = repairLocks.get(bookingId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prior.then(() => gate);
  repairLocks.set(bookingId, tail);

  await prior;
  try {
    return await task();
  } finally {
    release();
    if (repairLocks.get(bookingId) === tail) {
      repairLocks.delete(bookingId);
    }
  }
}

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

  return withBookingRepairLock(bookingId, async () => {
    const repaired = await ensureBookingLineItemsForEarningsIfMissing(admin, bookingId);
    if (!repaired.ok) {
      return NextResponse.json({ ok: false, error: repaired.error }, { status: 500 });
    }

    const { data: lines, error: linesError } = await admin
      .from("booking_line_items")
      .select("item_type, slug, name, total_price_cents, earns_cleaner, pricing_source")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });

    if (linesError) {
      return NextResponse.json({ ok: false, error: linesError.message }, { status: 500 });
    }

    const rows = lines ?? [];
    const lineTotalCents = rows.reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);
    const cleanerLineCents = rows
      .filter((row) => row.earns_cleaner !== false)
      .reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);

    return NextResponse.json({
      ok: true,
      bookingId,
      lineCount: rows.length,
      lineTotalCents,
      cleanerLineCents,
      lines: rows,
    });
  });
}
