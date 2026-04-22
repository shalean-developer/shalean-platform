import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import {
  buildAssistantSlots,
  getSmartExtras,
  getSmartRecommendations,
  type BookingContext,
} from "@/lib/ai/bookingAssistant";
import type { ParsedBookingIntent } from "@/lib/ai/parseBookingIntent";
import { resolveIntentDateYmd } from "@/lib/ai/parseBookingIntent";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { buildLockedBookingSnapshot } from "@/lib/booking/buildLockedBooking";
import { calculateSmartQuote } from "@/lib/pricing/calculatePrice";
import type { VipTier } from "@/lib/pricing/vipTier";

/** Same grid as Step 2 schedule UI. */
export const BOOKING_AGENT_SLOT_TIMES = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
] as const;

export type BookingAgentQuoteResult = {
  intent: ParsedBookingIntent;
  step1: BookingStep1State;
  dateYmd: string;
  slots: { time: string; priceZar: number; demand: "low" | "normal" | "high" }[];
  recommendations: ReturnType<typeof getSmartRecommendations>;
  suggestedLocked: ReturnType<typeof buildLockedBookingSnapshot>;
  smartExtras: ReturnType<typeof getSmartExtras>;
  personalizationNote?: string;
};

function isAgentSlotTime(time: string): boolean {
  return (BOOKING_AGENT_SLOT_TIMES as readonly string[]).includes(time);
}

/**
 * Build a full quote: slot grid with dynamic adjustments, assistant picks, and a server-valid `LockedBooking`.
 */
export function buildBookingAgentQuote(
  intent: ParsedBookingIntent,
  step1: BookingStep1State,
  options: {
    vipTier: VipTier;
    slotAdjustments: Record<string, number>;
    /** Override “today” for tests */
    todayYmd?: string;
    /** Fixed calendar date (skips intent relative dates) */
    dateYmdOverride?: string | null;
    /** User or UI picked a slot from the grid */
    overrideTime?: string | null;
  },
): BookingAgentQuoteResult {
  const todayYmd = options.todayYmd ?? todayYmdJohannesburg();
  const dateYmd =
    options.dateYmdOverride && /^\d{4}-\d{2}-\d{2}$/.test(options.dateYmdOverride.trim())
      ? options.dateYmdOverride.trim()
      : resolveIntentDateYmd(intent, todayYmd);

  const input = {
    service: step1.service,
    serviceType: step1.service_type,
    rooms: step1.rooms,
    bathrooms: step1.bathrooms,
    extraRooms: step1.extraRooms,
    extras: step1.extras,
  };

  const byPrice: Record<string, number> = {};
  for (const t of BOOKING_AGENT_SLOT_TIMES) {
    const adj = options.slotAdjustments[t] ?? 1;
    byPrice[t] = calculateSmartQuote(input, t, options.vipTier, { dynamicAdjustment: adj }).total;
  }

  const slots = buildAssistantSlots(BOOKING_AGENT_SLOT_TIMES, byPrice);
  const ctx: BookingContext = {
    service: step1.service ?? "standard",
    rooms: step1.rooms,
    bathrooms: step1.bathrooms,
    extras: step1.extras,
    userTier: options.vipTier,
    pastBookings: [],
  };
  const recommendations = getSmartRecommendations(ctx, slots);

  const pickTime =
    options.overrideTime && isAgentSlotTime(options.overrideTime.trim())
      ? options.overrideTime.trim()
      : recommendations.recommended.time;
  const dynamicFactor = options.slotAdjustments[pickTime] ?? 1;

  const suggestedLocked = buildLockedBookingSnapshot(step1, { date: dateYmd, time: pickTime }, {
    vipTier: options.vipTier,
    dynamicSurgeFactor: dynamicFactor !== 1 ? dynamicFactor : undefined,
  });

  const smartExtras = getSmartExtras(ctx);

  return {
    intent,
    step1,
    dateYmd,
    slots: slots.map((s) => ({ time: s.time, priceZar: s.price, demand: s.demand })),
    recommendations,
    suggestedLocked,
    smartExtras,
    personalizationNote: recommendations.personalizationNote,
  };
}
