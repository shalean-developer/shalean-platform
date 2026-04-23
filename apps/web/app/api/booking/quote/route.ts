import { NextResponse } from "next/server";
import { quoteLockFromRequestBodyWithSnapshot } from "@/lib/booking/bookingLockQuote";
import { JOB_DURATION_QUOTE_ANCHOR_HM } from "@/lib/pricing/pricingEngine";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authoritative quote for job inputs (no slot commitment).
 * When `time` is omitted or invalid, uses a neutral anchor time for slot multipliers only.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Pricing is temporarily unavailable." }, { status: 503 });
  }
  const snapshot = await buildPricingRatesSnapshotFromDb(admin);
  if (!snapshot) {
    return NextResponse.json({ error: "Could not load pricing catalog." }, { status: 503 });
  }

  const input =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>) }
      : null;
  if (!input) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const timeRaw = String(input.time ?? (input as { selectedTime?: unknown }).selectedTime ?? "").trim();
  if (!/^\d{2}:\d{2}/.test(timeRaw)) {
    input.time = JOB_DURATION_QUOTE_ANCHOR_HM;
  }

  const r = quoteLockFromRequestBodyWithSnapshot(input, snapshot, { allowClientDynamicAdjustment: false });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }

  const q = r.quote;
  return NextResponse.json({
    pricingVersion: q.pricingVersion,
    total: q.totalZar,
    hours: q.hours,
    breakdown: q,
  });
}
