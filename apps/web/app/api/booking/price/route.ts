import { NextResponse } from "next/server";
import { quoteLockFromRequestBodyWithSnapshot } from "@/lib/booking/bookingLockQuote";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { calculateDynamicPrice } from "@/lib/marketplace-intelligence/dynamicPricing";
import { getAiAutonomyFlags } from "@/lib/ai-autonomy/flags";
import { calculateDynamicPriceWithAiLayers } from "@/lib/ai-autonomy/dynamicPricingWithAi";
import { forecastDemand } from "@/lib/marketplace-intelligence/demandForecast";
import { countEligibleCleaners } from "@/lib/booking/getEligibleCleaners";
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
  let headlinePrice = q.totalZar;
  let marketplaceDynamic: {
    final_price: number;
    price_adjustment_reason: string;
    forecast_demand_level: string | null;
  } | null = null;

  if (process.env.MARKETPLACE_LIVE_DYNAMIC_PRICING === "true") {
    const b = body as Record<string, unknown>;
    const area = String(b.cityId ?? b.city_id ?? b.locationId ?? b.location_id ?? "").trim();
    const dateYmd = typeof b.date === "string" ? b.date.trim() : "";
    let demandLevel: "low" | "medium" | "high" = "medium";
    if (area && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      const fc = await forecastDemand(admin, dateYmd, area);
      demandLevel = fc.demand_level;
    }
    const slotHm = r.timeHm;
    const slotHour = parseInt(slotHm.slice(0, 2), 10);
    const dow = /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)
      ? new Date(`${dateYmd}T12:00:00Z`).getUTCDay()
      : new Date().getUTCDay();
    const loc = String(b.locationId ?? b.location_id ?? "").trim();
    let cleanersN: number | null = null;
    if (loc && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd) && r.timeHm) {
      const durationMin = Math.max(30, Math.round((q.hours ?? 2) * 60));
      cleanersN = await countEligibleCleaners(admin, {
        date: dateYmd,
        startTime: r.timeHm,
        durationMinutes: durationMin,
        locationId: loc,
        locationExpandedIds: [loc],
      });
    }
    const availRatio = cleanersN != null ? Math.min(1, cleanersN / 12) : null;
    const dynCtx = {
      hourOfDay: Number.isFinite(slotHour) ? slotHour : 12,
      dayOfWeek: dow,
      demandLevel,
      cleanerAvailabilityRatio: availRatio,
    };
    const convCtx = {
      segment: "unknown" as const,
      price: q.totalZar,
      hourOfDay: dynCtx.hourOfDay,
      dayOfWeek: dynCtx.dayOfWeek,
      channel: "web" as const,
    };
    const aiFlags = getAiAutonomyFlags();
    const dp = aiFlags.pricing
      ? await calculateDynamicPriceWithAiLayers(q.totalZar, dynCtx, convCtx, {
          supabase: admin,
          emitLog: true,
          experimentSubjectId: typeof (body as { sessionId?: string }).sessionId === "string"
            ? String((body as { sessionId?: string }).sessionId)
            : undefined,
        })
      : calculateDynamicPrice(q.totalZar, dynCtx, { emitLog: true });
    headlinePrice = dp.final_price;
    marketplaceDynamic = {
      final_price: dp.final_price,
      price_adjustment_reason: dp.price_adjustment_reason,
      forecast_demand_level: area && dateYmd ? demandLevel : null,
    };
  }

  return NextResponse.json({
    price: headlinePrice,
    duration: q.hours,
    surgeMultiplier: q.effectiveSurgeMultiplier,
    surgeApplied: q.effectiveSurgeMultiplier > 1.001,
    surgeLabel: q.surgeLabel,
    demandLabel: q.demandLabel,
    breakdown: q,
    ...(marketplaceDynamic ? { marketplaceDynamic } : {}),
  });
}
