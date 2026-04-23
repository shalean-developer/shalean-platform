import { NextResponse } from "next/server";
import { quoteLockFromRequestBody } from "@/lib/booking/bookingLockQuote";

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

  const r = quoteLockFromRequestBody(body, { allowClientDynamicAdjustment: false });
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
