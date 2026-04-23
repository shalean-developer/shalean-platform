import { NextResponse } from "next/server";
import { quoteLockFromRequestBodyWithSnapshot } from "@/lib/booking/bookingLockQuote";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same quote engine as `POST /api/booking/lock` — stable field names for older clients. */
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

  const r = quoteLockFromRequestBodyWithSnapshot(body, snapshot, { allowClientDynamicAdjustment: false });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }

  const q = r.quote;
  return NextResponse.json({
    price: q.totalZar,
    duration: q.hours,
    surgeMultiplier: q.effectiveSurgeMultiplier,
    surgeApplied: q.effectiveSurgeMultiplier > 1.001,
    surgeLabel: q.surgeLabel,
    demandLabel: q.demandLabel,
    breakdown: q,
  });
}
