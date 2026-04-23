import type { ConversionBookingFormState } from "@/components/booking/conversion/conversionBookingTypes";
import { buildWidgetLockedQuote, finalizeWidgetStep1, type WidgetIntakePayload } from "@/lib/booking/bookingWidgetDraft";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { PRICING_CONFIG } from "@/lib/pricing/pricingConfig";

/**
 * Builds a Paystack-compatible `LockedBooking` from the 2-step conversion form.
 * `form.price` must be the server-locked ZAR total from `/api/bookings` dryRun.
 */
export function buildConversionLockedBooking(form: ConversionBookingFormState): LockedBooking | null {
  if (form.price == null || !Number.isFinite(form.price) || form.price < 1) return null;

  const intake: WidgetIntakePayload = {
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    extraRooms: form.extraRooms,
    service: form.service,
    date: form.date,
    time: form.time,
    extras: form.extras,
    location: form.address.trim().slice(0, 500),
  };

  const step1 = finalizeWidgetStep1(intake);
  const step1WithProperty = { ...step1, propertyType: "house" as const };

  const quote = buildWidgetLockedQuote(form.price);
  const lockedAt = new Date().toISOString();

  const raw = {
    ...step1WithProperty,
    date: form.date,
    time: form.time,
    finalPrice: form.price,
    finalHours: quote.hours,
    price: form.price,
    duration: quote.hours,
    surge: quote.surge,
    surgeLabel: quote.surgeLabel,
    cleanersCount: quote.cleanersCount,
    vipTier: "regular" as const,
    pricingVersion: PRICING_CONFIG.version,
    locked: true,
    lockedAt,
  };

  return parseLockedBookingFromUnknown(raw);
}
