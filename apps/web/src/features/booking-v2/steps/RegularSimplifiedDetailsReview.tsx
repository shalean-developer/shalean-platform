"use client";

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
      <section className="space-y-3 rounded-lg border border-[#DCE7FF] bg-white p-4 sm:p-5">
        <div>
          <h2 className="text-xl font-bold text-[#00164E]">Your details</h2>
          <p className="mt-1 text-sm text-slate-600">
            Add the visit address and contact number. We will validate the location
            before your booking is confirmed.
          </p>
        </div>
        <PropertyAddressSection />
        {equipmentRequired === "yes" && (
          <div className="space-y-2 border-t border-[#DCE7FF] pt-4">
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
