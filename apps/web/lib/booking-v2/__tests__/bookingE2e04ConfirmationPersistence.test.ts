import { describe, expect, it } from "vitest";
import { buildBookingV2HistorySnapshot } from "@/lib/booking-v2/buildBookingV2HistorySnapshot";

const data = {
  serviceSlug: "regular-cleaning", serviceDetails: { bedrooms: "2" }, address: "1 Test Road", suburb: "Claremont", city: "Cape Town", postalCode: "7708", accessInstructions: "", parkingInstructions: "", gateCode: "", contactPhone: "+27710000000", selectedExtras: [], equipmentRequired: "no", equipmentQuote: null, bookingType: "once_off", date: "2026-11-16", time: "08:30", alternativeDate: "", alternativeTime: "", recurringFrequency: "", recurringDays: [], recurringStartDate: "", recurringEndDate: "", cleanerMode: "individual_cleaners", assignedTeamId: "", assignedTeamName: "", cleanerCount: 1, selectedCleanerIds: [], selectedCleanerDetails: [], pricingSummary: null, quoteLock: null,
} as any;

function build() {
  return buildBookingV2HistorySnapshot({ data, selectedExtraIds: [], serverEquipmentQuote: null, serverBreakdown: { total: 500 }, customerPhone: "+27710000000", customerName: "Test User", customerEmailNormalized: "test@example.com", promotionApplied: [], promotionDiscountZar: 0, promoCodeInput: "", payAmountZar: 500, recurringPrepaymentQuote: null, fulfillmentMode: "cleaner_selection", fulfillmentReason: "customer_choice", preferredExtrasSnapshotExtension: {}, confirmedAt: "2026-09-25T10:00:00.000Z" });
}

describe("BOOKING-E2E-04 canonical booking history snapshot", () => {
  it("is deterministic for identical confirmation inputs", () => {
    expect(build()).toEqual(build());
  });

  it("keeps payable and confirmation timestamp explicit rather than generating them internally", () => {
    const snapshot = build();
    expect(snapshot.payTotalZar).toBe(500);
    expect(snapshot.confirmedAt).toBe("2026-09-25T10:00:00.000Z");
  });
});
