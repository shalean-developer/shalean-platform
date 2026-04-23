import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import type { VipTier } from "@/lib/pricing/vipTier";

/** Stable key when job dimensions or VIP tier change — drives a single canonical quote recompute. */
export function bookingPricingFingerprint(state: BookingStep1State, tier: VipTier): string {
  return [
    state.service ?? "",
    state.service_type ?? "",
    state.rooms,
    state.bathrooms,
    state.extraRooms,
    state.extras.join("\u0001"),
    tier,
  ].join("|");
}
