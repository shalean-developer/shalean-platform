"use client";

import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import { buildCustomerPricingFromForm } from "@/lib/booking-v2/buildCustomerPricingFromForm";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";

/**
 * Recomputes pricingSummary whenever booking inputs, live catalog/config, or VIP tier change.
 * Mount once inside BookingV2Provider (e.g. BookingV2Shell).
 * VIP must match confirm/Paystack (user_profiles.tier) so display total === charge amount.
 */
export function useBookingV2Pricing(): void {
  const { serviceSlug, liveConfig, feesConfig } = useBookingV2();
  const { watch, setValue } = useFormContext<BookingV2FormData>();
  const { tier: vipTier } = useBookingVipTier();

  const serviceDetails = watch("serviceDetails");
  const selectedExtras = watch("selectedExtras");
  const cleanerMode = watch("cleanerMode");
  const cleanerCount = watch("cleanerCount");
  const bookingType = watch("bookingType");
  const recurringFrequency = watch("recurringFrequency");

  const equipmentRequired = watch("equipmentRequired");
  const equipmentQuote = watch("equipmentQuote");

  useEffect(() => {
    const breakdown = buildCustomerPricingFromForm({
      serviceSlug,
      values: {
        serviceDetails: serviceDetails ?? {},
        selectedExtras: selectedExtras ?? [],
        cleanerMode,
        cleanerCount: cleanerCount ?? 1,
        bookingType,
        recurringFrequency: recurringFrequency ?? "",
        equipmentRequired: equipmentRequired ?? "",
        equipmentQuote: equipmentQuote ?? null,
      },
      liveConfig,
      feesConfig,
      vipTier,
    });
    setValue("pricingSummary", breakdown, { shouldDirty: false, shouldValidate: false });
  }, [
    serviceSlug,
    liveConfig,
    feesConfig,
    vipTier,
    cleanerMode,
    cleanerCount,
    bookingType,
    recurringFrequency,
    equipmentRequired,
    setValue,
    JSON.stringify(serviceDetails),
    JSON.stringify(selectedExtras),
    JSON.stringify(equipmentQuote),
  ]);
}
