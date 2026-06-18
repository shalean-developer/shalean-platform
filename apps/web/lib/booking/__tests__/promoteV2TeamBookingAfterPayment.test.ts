import { describe, expect, it } from "vitest";
import { teamServiceTypeFromBookingSlug } from "@/lib/booking/promoteV2TeamBookingAfterPayment";

describe("promoteV2TeamBookingAfterPayment", () => {
  it("maps V2 service slugs to team dispatch service types", () => {
    expect(teamServiceTypeFromBookingSlug("moving-cleaning")).toBe("move_cleaning");
    expect(teamServiceTypeFromBookingSlug("deep-cleaning")).toBe("deep_cleaning");
    expect(teamServiceTypeFromBookingSlug("regular-cleaning")).toBe("deep_cleaning");
  });
});
