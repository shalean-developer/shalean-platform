import { NextResponse } from "next/server";
import { CONFIG_MISSING_BOOKING_LOCK_HMAC } from "@/lib/booking/bookingLockHmacSecret";
import { getOrCreatePricingVersionId } from "@/lib/booking/pricingVersionDb";
import { quoteLockFromRequestBodyWithSnapshot } from "@/lib/booking/bookingLockQuote";
import { computeLockQuoteSignature, LOCK_HOLD_MS } from "@/lib/booking/lockQuoteSignature";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { extrasLineItemsFromSnapshot } from "@/lib/pricing/extrasConfig";
import { resolveServiceForPricing } from "@/lib/pricing/pricingEngine";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validateLockSlotAgainstEligibility } from "@/lib/booking/validateLockSlotEligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authoritative slot lock quote — recomputes price on the server from Supabase catalog + `quoteCheckoutZarWithSnapshot`.
 * Client must persist returned totals + `signature` + `lockExpiresAt` (never trust slot list or client totals).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Pricing is temporarily unavailable. Please try again in a moment." },
      { status: 503 },
    );
  }

  const snapshot = await buildPricingRatesSnapshotFromDb(admin);
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, error: "Could not load pricing catalog. Please try again in a moment." },
      { status: 503 },
    );
  }

  const r = quoteLockFromRequestBodyWithSnapshot(body, snapshot, { allowClientDynamicAdjustment: false });
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  }

  const b = body as Record<string, unknown>;
  const slotCheck = await validateLockSlotAgainstEligibility(admin, b, {
    timeHm: r.timeHm,
    durationHours: r.quote.hours,
  });
  if (!slotCheck.ok) {
    return NextResponse.json({ ok: false, error: slotCheck.error }, { status: slotCheck.status });
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

  const svc = resolveServiceForPricing(r.job);
  const extras_line_items = extrasLineItemsFromSnapshot(snapshot, r.job.extras, svc);

  let pricing_version_id: string | undefined;
  const pv = await getOrCreatePricingVersionId(admin, snapshot);
  if (pv) pricing_version_id = pv.id;

  return NextResponse.json({
    ok: true,
    pricingVersion: q.pricingVersion,
    ...(pricing_version_id ? { pricing_version_id } : {}),
    total: q.totalZar,
    hours: q.hours,
    surgeMultiplier: q.effectiveSurgeMultiplier,
    surgeApplied: q.effectiveSurgeMultiplier > 1.001,
    surgeLabel: q.surgeLabel,
    demandLabel: q.demandLabel,
    vipTier: r.vipTier,
    breakdown: q,
    extras_line_items,
    signature,
    lockExpiresAt,
  });
}
