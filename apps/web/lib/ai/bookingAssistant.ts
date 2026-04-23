/**
 * Booking assistant recommendations. Pair with `user_behavior` + `user_events` on the server
 * for repeat extras and slot preferences (see `/api/ai/booking-agent` and `usePastBookingHints`).
 */
import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import { isExtraAllowedForService } from "@/lib/pricing/extrasConfig";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import { getDemandPricingLabel } from "@/lib/pricing/slotSurge";

export type BookingContext = {
  service: string;
  rooms: number;
  bathrooms: number;
  extras: string[];
  userTier?: string;
  /** Most recent first — optional `time` / `extras` from past bookings */
  pastBookings?: PastBookingHint[];
};

export type PastBookingHint = {
  time?: string | null;
  extras?: string[];
  dateYmd?: string | null;
};

export type TimeSlot = {
  time: string;
  price: number;
  demand: "low" | "normal" | "high";
};

export type SmartRecommendations = {
  bestValue: TimeSlot;
  recommended: TimeSlot;
  fastest: TimeSlot;
  /** Shown when we match a previous visit time */
  personalizationNote?: string;
};

function demandFromTimeHm(time: string): TimeSlot["demand"] {
  const band = getDemandPricingLabel(time);
  if (band === "peak") return "high";
  if (band === "value") return "low";
  return "normal";
}

/** Build assistant slots from price map (same order as `orderedTimes`). */
export function buildAssistantSlots(orderedTimes: readonly string[], byPrice: Record<string, number>): TimeSlot[] {
  return orderedTimes.map((time) => ({
    time,
    price: byPrice[time] ?? 0,
    demand: demandFromTimeHm(time),
  }));
}

/**
 * Picks best value (min price), a balanced “recommended” slot, and earliest in the list.
 * Uses past booking time for personalization when available.
 */
export function getSmartRecommendations(context: BookingContext, slots: TimeSlot[]): SmartRecommendations {
  if (slots.length === 0) {
    throw new Error("getSmartRecommendations: slots must be non-empty");
  }

  const sorted = [...slots].sort((a, b) => a.price - b.price);
  const bestValue = sorted[0]!;
  const fastest = slots[0]!;

  const last = context.pastBookings?.[0];
  const lastTime = last?.time?.trim();
  if (lastTime) {
    const same = slots.find((s) => s.time === lastTime);
    if (same) {
      return {
        bestValue,
        recommended: same,
        fastest,
        personalizationNote: `Last time you booked at ${lastTime} — want the same?`,
      };
    }
  }

  const normalBand = slots.filter((s) => s.demand === "normal");
  const midPrice = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 2))]!.price;

  const recommended =
    normalBand.find((s) => s.price <= midPrice) ?? normalBand[0] ?? slots.find((s) => s.demand === "normal") ?? bestValue;

  return {
    bestValue,
    recommended,
    fastest,
  };
}

export type SmartExtraSuggestion = {
  id: string;
  label: string;
  reason: string;
  price: number;
};

const EXTRA_LABEL: Record<string, string> = {
  "inside-cabinets": "Inside cabinets",
  "inside-fridge": "Inside fridge",
  "inside-oven": "Inside oven",
  "interior-windows": "Interior windows",
  "interior-walls": "Interior walls",
  ironing: "Ironing",
  laundry: "Laundry",
  "water-plants": "Water plants",
  "balcony-cleaning": "Balcony cleaning",
  "carpet-cleaning": "Carpet cleaning",
  "ceiling-cleaning": "Ceiling cleaning",
  "garage-cleaning": "Garage cleaning",
  "mattress-cleaning": "Mattress cleaning",
  "outside-windows": "Outside windows",
  "extra-cleaner": "Extra cleaner",
  "supplies-kit": "Supplies kit",
};

/**
 * Contextual add-ons — IDs must exist in the active pricing catalog.
 */
export function getSmartExtras(context: BookingContext, snapshot: PricingRatesSnapshot): SmartExtraSuggestion[] {
  const suggestions: SmartExtraSuggestion[] = [];
  const has = (id: string) => context.extras.includes(id);
  const price = (id: string) => snapshot.extras[id]?.price ?? 0;
  const svc = parseBookingServiceId(context.service);
  if (!svc) return [];

  const push = (id: string, label: string, reason: string) => {
    if (has(id)) return;
    if (!svc || !isExtraAllowedForService(id, svc, snapshot)) return;
    suggestions.push({ id, label, reason, price: price(id) });
  };

  if (svc && ["deep", "move", "carpet"].includes(svc)) {
    push("mattress-cleaning", "Mattress cleaning", "Refresh beds after a big clean or move.");
    push("carpet-cleaning", "Carpet cleaning", "Lift traffic marks in carpeted areas.");
    push("balcony-cleaning", "Balcony cleaning", "Outdoor living space ready for handover.");
  } else {
    if (context.rooms >= 3) {
      push(
        "inside-cabinets",
        "Inside cabinets",
        "Larger homes benefit from a detailed cabinet wipe-down.",
      );
    }
    push("inside-fridge", "Inside fridge", "Popular add-on — fresh and ready for guests.");
    if (context.service === "airbnb") {
      push("ironing", "Ironing", "Great for Airbnb turnovers — crisp linens in photos.");
      push("interior-windows", "Interior windows", "Brightens listing photos between guests.");
    }
  }

  if (context.pastBookings?.length) {
    const prevExtras = new Set(context.pastBookings.flatMap((b) => b.extras ?? []));
    for (const id of prevExtras) {
      if (!has(id) && EXTRA_LABEL[id] && snapshot.extras[id] != null) {
        push(id, EXTRA_LABEL[id] ?? id, "You added this last time — one tap to include again.");
      }
    }
  }

  const seen = new Set<string>();
  return suggestions.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

/** Premium / peak window → nudge higher-value extras */
export function getPremiumTimeUpsellExtras(
  context: BookingContext,
  snapshot: PricingRatesSnapshot,
): SmartExtraSuggestion[] {
  const out: SmartExtraSuggestion[] = [];
  const has = (id: string) => context.extras.includes(id);
  const svc = parseBookingServiceId(context.service);
  const lightIds = ["interior-windows", "inside-oven"] as const;
  const heavyIds = ["balcony-cleaning", "outside-windows"] as const;
  const ids =
    svc && ["deep", "move", "carpet"].includes(svc)
      ? (heavyIds as unknown as readonly string[])
      : (lightIds as unknown as readonly string[]);
  for (const id of ids) {
    if (!has(id) && snapshot.extras[id] != null && svc && isExtraAllowedForService(id, svc, snapshot)) {
      out.push({
        id,
        label: EXTRA_LABEL[id] ?? id,
        reason: "Popular with premium time slots — complete the refresh.",
        price: snapshot.extras[id]!.price,
      });
    }
  }
  return out;
}
