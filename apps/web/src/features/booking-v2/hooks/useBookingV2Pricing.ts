"use client";

import { useEffect, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import { buildCustomerPricingFromForm } from "@/lib/booking-v2/buildCustomerPricingFromForm";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import { cachedClientRequest } from "@/lib/booking-v2/clientRequestCache";

/**
 * Recomputes pricingSummary whenever booking inputs, live catalog/config, or VIP tier change.
 * Mount once inside BookingV2Provider (e.g. BookingV2Shell).
 * VIP must match confirm/Paystack (user_profiles.tier) so display total === charge amount.
 */
export function useBookingV2Pricing(): void {
  const { serviceSlug, liveConfig, feesConfig } = useBookingV2();
  const { control, setValue } = useFormContext<BookingV2FormData>();
  const { tier: vipTier } = useBookingVipTier();
  const quoteRevision = useRef(0);

  // useWatch subscribes this hook to nested field updates. React Hook Form may keep
  // the serviceDetails object identity stable while changing a bedroom/bathroom
  // property, so a serialized snapshot is used as the effect dependency below.
  const serviceDetails = useWatch({ control, name: "serviceDetails" });
  const selectedExtras = useWatch({ control, name: "selectedExtras" });
  const cleanerMode = useWatch({ control, name: "cleanerMode" });
  const cleanerCount = useWatch({ control, name: "cleanerCount" });
  const bookingType = useWatch({ control, name: "bookingType" });
  const recurringFrequency = useWatch({ control, name: "recurringFrequency" });
  const equipmentRequired = useWatch({ control, name: "equipmentRequired" });
  const equipmentQuote = useWatch({ control, name: "equipmentQuote" });
  const serviceDetailsSnapshot = JSON.stringify(serviceDetails ?? {});
  const selectedExtrasSnapshot = JSON.stringify(selectedExtras ?? []);
  const equipmentQuoteSnapshot = JSON.stringify(equipmentQuote ?? null);

  useEffect(() => {
    const revision = ++quoteRevision.current;
    const currentServiceDetails = JSON.parse(serviceDetailsSnapshot) as NonNullable<
      BookingV2FormData["serviceDetails"]
    >;
    const currentSelectedExtras = JSON.parse(selectedExtrasSnapshot) as BookingV2FormData["selectedExtras"];
    const currentEquipmentQuote = JSON.parse(equipmentQuoteSnapshot) as BookingV2FormData["equipmentQuote"];
    const breakdown = buildCustomerPricingFromForm({
      serviceSlug,
      values: {
        serviceDetails: currentServiceDetails,
        selectedExtras: currentSelectedExtras,
        cleanerMode,
        cleanerCount: cleanerCount ?? 1,
        bookingType,
        recurringFrequency: recurringFrequency ?? "",
        equipmentRequired: equipmentRequired ?? "",
        equipmentQuote: currentEquipmentQuote,
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
    const timer = window.setTimeout(() => {
      const requestBody = JSON.stringify({
          serviceSlug,
          serviceDetails: currentServiceDetails,
          selectedExtras: currentSelectedExtras,
          cleanerMode,
          cleanerCount: cleanerCount ?? 1,
          bookingType,
          recurringFrequency: recurringFrequency ?? "",
          equipmentRequired: equipmentRequired ?? "",
          equipmentQuote: currentEquipmentQuote,
          vipTier,
        });
      void cachedClientRequest(
        `booking-quote:${requestBody}`,
        async () => {
          const response = await fetch("/api/booking-v2/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
          });
          if (!response.ok) throw new Error(`quote_http_${response.status}`);
          return response.json() as Promise<{ pricingSummary?: BookingV2FormData["pricingSummary"] }>;
        },
        30_000,
      )
        .then(({ pricingSummary }) => {
          // A slower response for a previous room selection must never replace
          // the immediately calculated total for the customer's latest choice.
          if (pricingSummary && revision === quoteRevision.current) {
            setValue("pricingSummary", pricingSummary, {
              shouldDirty: false,
              shouldValidate: false,
            });
          }
        })
        .catch(() => {
          // The immediate quote above remains usable; confirm still recalculates
          // and signs the authoritative amount before a booking is created.
        });
    }, 450);

    return () => {
      window.clearTimeout(timer);
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
    serviceDetailsSnapshot,
    selectedExtrasSnapshot,
    equipmentQuoteSnapshot,
  ]);
}
