import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import { regularSimplifiedPreviewEnabled } from "@/src/features/booking-v2/regularSimplifiedJourneyContract";

type PreparationFetch = (input: RequestInfo | URL, init: RequestInit, timeoutMs: number) => Promise<Response>;

/** Renew before first confirmation, even if the longer-lived booking lock is valid.
 * A persisted pending booking must continue using its canonical payment recovery.
 */
export async function renewFcoEquipmentForCheckout(
  serviceSlug: ServiceSlug,
  values: BookingV2FormData,
  fetcher: PreparationFetch,
): Promise<BookingV2FormData["equipmentQuote"]> {
  if (!regularSimplifiedPreviewEnabled(serviceSlug) ||
      values.equipmentRequired !== "yes" || values.pendingBookingId?.trim()) return null;
  const response = await fetcher("/api/booking-v2/equipment-quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serviceSlug, equipmentRequired: true,
      address: values.address, suburb: values.suburb,
      city: values.city || "Cape Town", postalCode: values.postalCode || "",
    }),
  }, 30_000);
  const result = await response.json() as {
    quote?: BookingV2FormData["equipmentQuote"]; error?: string;
  };
  const quote = result.quote;
  if (!response.ok || !quote || !quote.authorityReceipt ||
      quote.manual_quote_required || quote.geocode_error ||
      !Number.isFinite(quote.logistics_fee) || quote.logistics_fee < 0) {
    throw new Error(result.error || "Could not refresh equipment delivery. Please review your details and try again.");
  }
  return quote;
}
