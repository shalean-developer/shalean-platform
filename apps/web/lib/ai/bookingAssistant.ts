/**
 * Booking assistant recommendations. Pair with `user_behavior` + `user_events` on the server
 * for repeat extras and slot preferences (see `/api/ai/booking-agent` and `usePastBookingHints`).
 */
import { EXTRAS_ZAR } from "@/lib/pricing/calculatePrice";
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
  ironing: "Ironing",
};

/**
 * Contextual add-ons — only IDs that exist in `EXTRAS_ZAR` / Step 1 chips.
 */
export function getSmartExtras(context: BookingContext): SmartExtraSuggestion[] {
  const suggestions: SmartExtraSuggestion[] = [];
  const has = (id: string) => context.extras.includes(id);

  if (context.rooms >= 3 && !has("inside-cabinets")) {
    suggestions.push({
      id: "inside-cabinets",
      label: "Inside cabinets",
      reason: "Larger homes benefit from a detailed cabinet wipe-down.",
      price: EXTRAS_ZAR["inside-cabinets"] ?? 40,
    });
  }

  if (!has("inside-fridge")) {
    suggestions.push({
      id: "inside-fridge",
      label: "Inside fridge",
      reason: "Popular add-on — fresh and ready for guests.",
      price: EXTRAS_ZAR["inside-fridge"] ?? 30,
    });
  }

  if (context.service === "airbnb" && !has("ironing")) {
    suggestions.push({
      id: "ironing",
      label: "Ironing",
      reason: "Great for Airbnb turnovers — crisp linens in photos.",
      price: EXTRAS_ZAR.ironing ?? 40,
    });
  }

  if (context.service === "airbnb" && !has("interior-windows")) {
    suggestions.push({
      id: "interior-windows",
      label: "Interior windows",
      reason: "Brightens listing photos between guests.",
      price: EXTRAS_ZAR["interior-windows"] ?? 60,
    });
  }

  if (context.pastBookings?.length) {
    const prevExtras = new Set(context.pastBookings.flatMap((b) => b.extras ?? []));
    for (const id of prevExtras) {
      if (!has(id) && EXTRA_LABEL[id] && EXTRAS_ZAR[id] != null) {
        suggestions.push({
          id,
          label: EXTRA_LABEL[id] ?? id,
          reason: "You added this last time — one tap to include again.",
          price: EXTRAS_ZAR[id]!,
        });
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
export function getPremiumTimeUpsellExtras(context: BookingContext): SmartExtraSuggestion[] {
  const out: SmartExtraSuggestion[] = [];
  const has = (id: string) => context.extras.includes(id);
  for (const id of ["interior-windows", "inside-oven"] as const) {
    if (!has(id) && EXTRAS_ZAR[id] != null) {
      out.push({
        id,
        label: EXTRA_LABEL[id] ?? id,
        reason: "Popular with premium time slots — complete the refresh.",
        price: EXTRAS_ZAR[id]!,
      });
    }
  }
  return out;
}
