import "server-only";

import { resolveBookingV2Quote } from "@/lib/booking/quote/resolveBookingQuote";
import type { CustomerPricingBreakdown } from "@/lib/booking-v2/types";
import {
  buildCustomerTotalInputFromForm,
  type BuildCustomerPricingFromFormParams,
} from "@/lib/booking-v2/buildCustomerPricingFromForm";

/**
 * Server-only authoritative quote (HMAC-signed). Use at confirm / seed / admin persist.
 * Never import this from client components — it pulls Node crypto.
 */
export function buildSignedCustomerPricingFromForm(
  params: BuildCustomerPricingFromFormParams,
): CustomerPricingBreakdown {
  return resolveBookingV2Quote(buildCustomerTotalInputFromForm(params)).breakdown;
}
