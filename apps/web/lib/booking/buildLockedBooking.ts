import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import { calculateSmartQuote } from "@/lib/pricing/calculatePrice";
import type { VipTier } from "@/lib/pricing/vipTier";
import type { LockedBooking } from "@/lib/booking/lockedBooking";

/**
 * Server-side equivalent of `lockBookingSlot` — builds a validated `LockedBooking` without touching `localStorage`.
 * Use for AI booking agent and programmatic quotes.
 */
export function buildLockedBookingSnapshot(
  state: BookingStep1State,
  selection: { date: string; time: string },
  options?: { vipTier?: VipTier; dynamicSurgeFactor?: number },
): LockedBooking {
  const tier = options?.vipTier ?? "regular";
  let dyn = 1;
  if (typeof options?.dynamicSurgeFactor === "number" && Number.isFinite(options.dynamicSurgeFactor)) {
    dyn = Math.min(1.2, Math.max(0.8, options.dynamicSurgeFactor));
  }

  const quote = calculateSmartQuote(
    {
      service: state.service,
      serviceType: state.service_type,
      rooms: state.rooms,
      bathrooms: state.bathrooms,
      extraRooms: state.extraRooms,
      extras: state.extras,
    },
    selection.time,
    tier,
    { dynamicAdjustment: dyn },
  );

  const locked: LockedBooking = {
    ...state,
    date: selection.date,
    time: selection.time,
    finalPrice: quote.total,
    finalHours: quote.hours,
    surge: quote.surge,
    vipTier: tier,
    pricingVersion: 2,
    locked: true,
    lockedAt: new Date().toISOString(),
  };

  if (dyn !== 1) {
    locked.dynamicSurgeFactor = dyn;
  }

  return locked;
}
