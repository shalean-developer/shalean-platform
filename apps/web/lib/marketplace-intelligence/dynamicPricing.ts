import { logSystemEvent } from "@/lib/logging/systemLog";
import type { DynamicPriceResult, DynamicPricingContext } from "@/lib/marketplace-intelligence/types";

function isWeekend(dow: number): boolean {
  return dow === 0 || dow === 6;
}

function isPeakHour(hour: number): boolean {
  return hour >= 7 && hour <= 9 || hour >= 16 && hour <= 19;
}

/**
 * Lightweight dynamic pricing on top of an already-quoted base (ZAR or minor units — caller defines scale).
 * Logs `dynamic_price_applied` when adjustment is non-zero.
 *
 * Phase-5 wrapper: `calculateDynamicPriceWithAiLayers` in `lib/ai-autonomy/dynamicPricingWithAi.ts`.
 */
export function calculateDynamicPrice(
  basePrice: number,
  context: DynamicPricingContext,
  options?: { emitLog?: boolean },
): DynamicPriceResult {
  const emitLog = options?.emitLog === true;
  const base = Number.isFinite(basePrice) ? Math.max(0, basePrice) : 0;
  let mult = 1;
  const reasons: string[] = [];

  if (context.demandLevel === "high") {
    mult *= 1.08;
    reasons.push("high_demand");
  } else if (context.demandLevel === "low") {
    mult *= 0.94;
    reasons.push("low_demand_discount");
  }

  if (isPeakHour(context.hourOfDay)) {
    mult *= 1.05;
    reasons.push("peak_hour_surcharge");
  }

  if (isWeekend(context.dayOfWeek)) {
    mult *= 1.03;
    reasons.push("weekend_adjustment");
  }

  const avail = context.cleanerAvailabilityRatio;
  if (avail != null && Number.isFinite(avail)) {
    if (avail < 0.25) {
      mult *= 1.06;
      reasons.push("tight_cleaner_supply");
    } else if (avail > 0.65) {
      mult *= 0.98;
      reasons.push("healthy_cleaner_supply");
    }
  }

  mult = Math.min(1.25, Math.max(0.85, mult));
  const final_price = Math.round(base * mult * 100) / 100;
  const price_adjustment_reason = reasons.length ? reasons.join("+") : "none";

  if (emitLog && Math.abs(final_price - base) > 1e-6) {
    void logSystemEvent({
      level: "info",
      source: "dynamic_price_applied",
      message: "Dynamic pricing multiplier applied",
      context: {
        basePrice: base,
        final_price,
        multiplier: Math.round(mult * 1000) / 1000,
        price_adjustment_reason,
        hourOfDay: context.hourOfDay,
        dayOfWeek: context.dayOfWeek,
        demandLevel: context.demandLevel,
      },
    });
  }

  return { final_price, price_adjustment_reason };
}
