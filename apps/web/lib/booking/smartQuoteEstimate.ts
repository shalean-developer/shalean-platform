import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import { calculateSmartQuote } from "@/lib/pricing/calculatePrice";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import type { VipTier } from "@/lib/pricing/vipTier";

/** Representative times for a conservative “from” estimate (not the final slot price). */
export const ESTIMATE_ANCHOR_TIMES = ["08:00", "10:00", "12:00", "14:00", "15:00"] as const;

/** Minimum `calculateSmartQuote` total across anchor times — Steps 2–3 “From R …” only. */
export function estimateFromSmartQuoteMin(
  state: BookingStep1State,
  tier: VipTier,
  snapshot: PricingRatesSnapshot,
): number | null {
  if (!state.service) return null;
  const input = {
    service: state.service,
    serviceType: state.service_type,
    rooms: state.rooms,
    bathrooms: state.bathrooms,
    extraRooms: state.extraRooms,
    extras: state.extras,
  };
  let min = Infinity;
  for (const t of ESTIMATE_ANCHOR_TIMES) {
    min = Math.min(min, calculateSmartQuote(input, snapshot, t, tier).total);
  }
  return Number.isFinite(min) ? min : null;
}
