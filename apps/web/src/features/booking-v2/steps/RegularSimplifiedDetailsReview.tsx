"use client";

import { HomeSectionHeader } from "@/components/marketing-home/primitives/HomeSectionHeader";
import { useFormContext } from "react-hook-form";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import { PropertyAddressSection } from "@/src/features/booking-v2/components/PropertyAddressSection";
import { EquipmentSection } from "@/src/features/booking-v2/components/EquipmentSection";
import { Step3Review } from "@/src/features/booking-v2/steps/Step3Review";
import { regularEquipmentQuoteReady } from "@/src/features/booking-v2/regularSimplifiedJourneyContract";

/**
 * C3 presentation adapter. Full address/contact is collected here, after
 * scheduling; existing Step3Review, quote and cleaner/slot checks are retained.
 */
export function RegularSimplifiedDetailsReview() {
  const { watch } = useFormContext<BookingV2FormData>();
  // EquipmentSection owns address-scoped quote invalidation, including request
  // cancellation. Do not clear a freshly returned quote from this wrapper.
  const equipmentRequired = watch("equipmentRequired");
  const equipmentQuote = watch("equipmentQuote");
  const equipmentReady = regularEquipmentQuoteReady({ equipmentRequired, equipmentQuote });

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-border bg-white p-4 sm:p-5">
        <HomeSectionHeader
          title="Your details"
          description="Confirm your address and contact number, then review your clean."
        />
        <PropertyAddressSection />
        {equipmentRequired === "yes" && (
          <div className="space-y-2 border-t border-border pt-4">
            <EquipmentSection quoteOnly />
            {!equipmentReady && (
              <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Equipment delivery must be priced for your full address before payment.
                If a manual quote is needed, please contact Shalean to arrange it.
              </p>
            )}
          </div>
        )}
      </section>
      <Step3Review />
    </div>
  );
}
