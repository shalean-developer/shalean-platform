import { NextResponse } from "next/server";
import { CONFIG_MISSING_BOOKING_LOCK_HMAC } from "@/lib/booking/bookingLockHmacSecret";
import { quoteLockFromRequestBody } from "@/lib/booking/bookingLockQuote";
import { computeLockQuoteSignature, LOCK_HOLD_MS } from "@/lib/booking/lockQuoteSignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authoritative slot lock quote — recomputes price on the server via `quoteCheckoutZar`.
 * Client must persist returned totals + `signature` + `lockExpiresAt` (never trust slot list or client totals).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const r = quoteLockFromRequestBody(body, { allowClientDynamicAdjustment: false });
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  }

  const q = r.quote;
  let signature: string;
  try {
    signature = computeLockQuoteSignature({
      job: r.job,
      timeHm: r.timeHm,
      vipTier: r.vipTier,
      dynamicAdjustment: r.quoteOptions.dynamicAdjustment,
      cleanersCount: r.quoteOptions.cleanersCount,
      quote: q,
    });
  } catch (e) {
    if (e instanceof Error && e.message === CONFIG_MISSING_BOOKING_LOCK_HMAC) {
      return NextResponse.json(
        {
          ok: false,
          error: "Something went wrong. Please try again in a moment.",
          errorCode: CONFIG_MISSING_BOOKING_LOCK_HMAC,
        },
        { status: 503 },
      );
    }
    throw e;
  }
  const lockExpiresAt = new Date(Date.now() + LOCK_HOLD_MS).toISOString();

  return NextResponse.json({
    ok: true,
    pricingVersion: q.pricingVersion,
    total: q.totalZar,
    hours: q.hours,
    surgeMultiplier: q.effectiveSurgeMultiplier,
    surgeApplied: q.effectiveSurgeMultiplier > 1.001,
    surgeLabel: q.surgeLabel,
    demandLabel: q.demandLabel,
    vipTier: r.vipTier,
    breakdown: q,
    signature,
    lockExpiresAt,
  });
}
