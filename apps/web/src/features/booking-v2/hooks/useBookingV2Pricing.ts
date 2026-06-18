"use client";

import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import { buildCustomerPricingFromForm } from "@/lib/booking-v2/buildCustomerPricingFromForm";

/**
 * Recomputes pricingSummary whenever booking inputs or live catalog/config change.
 * Mount once inside BookingV2Provider (e.g. BookingV2Shell).
 */
export function useBookingV2Pricing(): void {
  const { serviceSlug, liveConfig, feesConfig } = useBookingV2();
  const { watch, setValue } = useFormContext<BookingV2FormData>();

  const serviceDetails = watch("serviceDetails");
  const selectedExtras = watch("selectedExtras");
  const cleanerMode = watch("cleanerMode");
  const cleanerCount = watch("cleanerCount");
  const bookingType = watch("bookingType");
  const recurringFrequency = watch("recurringFrequency");

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
      },
      liveConfig,
      feesConfig,
    });
    setValue("pricingSummary", breakdown, { shouldDirty: false, shouldValidate: false });
  }, [
    serviceSlug,
    liveConfig,
    feesConfig,
    cleanerMode,
    cleanerCount,
    bookingType,
    recurringFrequency,
    setValue,
    JSON.stringify(serviceDetails),
    JSON.stringify(selectedExtras),
  ]);
}
