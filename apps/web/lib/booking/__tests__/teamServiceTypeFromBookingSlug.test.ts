import { describe, expect, it } from "vitest";
import { teamServiceTypeFromBookingSlug } from "@/lib/booking/promoteV2TeamBookingAfterPayment";

describe("teamServiceTypeFromBookingSlug", () => {
  it("maps booking-v2 and legacy slugs to move_cleaning", () => {
    expect(teamServiceTypeFromBookingSlug("moving-cleaning")).toBe("move_cleaning");
    expect(teamServiceTypeFromBookingSlug("move")).toBe("move_cleaning");
    expect(teamServiceTypeFromBookingSlug("Move In/Out Cleaning")).toBe("move_cleaning");
  });

  it("defaults other slugs to deep_cleaning", () => {
    expect(teamServiceTypeFromBookingSlug("deep-cleaning")).toBe("deep_cleaning");
    expect(teamServiceTypeFromBookingSlug("deep")).toBe("deep_cleaning");
    expect(teamServiceTypeFromBookingSlug("")).toBe("deep_cleaning");
  });
});
