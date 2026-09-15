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

    // Reconcile the optimistic browser quote with a fresh server quote. The server
    // reloads pricing_services, so room rates, extras, fees, and discounts cannot
    // remain stuck on a persisted/static base price when the database changes.
    if (!liveConfig) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/booking-v2/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          serviceSlug,
          serviceDetails: serviceDetails ?? {},
          selectedExtras: selectedExtras ?? [],
          cleanerMode,
          cleanerCount: cleanerCount ?? 1,
          bookingType,
          recurringFrequency: recurringFrequency ?? "",
          equipmentRequired: equipmentRequired ?? "",
          equipmentQuote: equipmentQuote ?? null,
          vipTier,
        }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`quote_http_${response.status}`);
          return response.json() as Promise<{ pricingSummary?: BookingV2FormData["pricingSummary"] }>;
        })
        .then(({ pricingSummary }) => {
          if (pricingSummary) {
            setValue("pricingSummary", pricingSummary, {
              shouldDirty: false,
              shouldValidate: false,
            });
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          // The immediate quote above remains usable; confirm still recalculates
          // and signs the authoritative amount before a booking is created.
        });
    }, 120);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
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
    serviceDetails,
    selectedExtras,
    equipmentQuote,
  ]);
}
