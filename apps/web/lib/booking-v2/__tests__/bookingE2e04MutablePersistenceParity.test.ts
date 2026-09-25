import { describe, expect, it } from "vitest";
import { buildBookingV2MutablePersistence } from "@/lib/booking-v2/buildBookingV2MutablePersistence";

const base = {
  customerPhone: "+27710000000", canonicalServiceSlug: "regular-cleaning", serviceSlug: "regular-cleaning", serviceDetails: { bedrooms: "2" }, selectedExtraIds: ["oven"], date: "2026-11-16", time: "08:30", alternativeDate: "", alternativeTime: "", bookingType: "recurring", recurringFrequency: "weekly", recurringDays: ["Monday"], recurringStartDate: "", recurringEndDate: "", cleanerMode: "individual_cleaners", assignedTeamId: "", cleanerCount: 1, preferredCleanerIds: ["c1"], preferredCleanerFields: { selected_cleaner_id: "c1" }, persistPricing: { total_price: 500, amount_paid_cents: 0 }, pricingVersionId: "pv1", equipmentPersist: { equipment_required: false }, locationFields: { city: "Cape Town" }, priceSnapshot: { total_price: 500 }, fulfillmentMode: "cleaner_selection", fulfillmentReason: "customer_choice", address: "1 Test Road", suburb: "Claremont", postalCode: "7708", accessInstructions: "Bell", parkingInstructions: "Street", gateCode: "1234", bookingSnapshot: { payTotalZar: 500 },
};

describe("BOOKING-E2E-04 mutable persistence parity", () => {
  it("is deterministic and carries the fields shared by insert and pending retry", () => {
    const a = buildBookingV2MutablePersistence(base);
    const b = buildBookingV2MutablePersistence(base);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ service_slug: "regular-cleaning", location: "1 Test Road", recurring_frequency: "weekly", selected_extras: ["oven"], total_price: 500, pricing_version_id: "pv1", fulfillment_mode: "cleaner_selection", booking_snapshot: { payTotalZar: 500 } });
  });

  it("clears individual-only assignment fields when the shared contract switches to team mode", () => {
    const row = buildBookingV2MutablePersistence({ ...base, cleanerMode: "team", assignedTeamId: "team-1" });
    expect(row.assigned_team_id).toBe("team-1");
    expect(row.cleaner_count).toBeNull();
    expect(row).not.toHaveProperty("selected_cleaner_id");
  });
});
