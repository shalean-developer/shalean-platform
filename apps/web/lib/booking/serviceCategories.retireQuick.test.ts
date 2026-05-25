import { describe, expect, it } from "vitest";
import {
  BOOKING_SERVICE_IDS,
  SERVICE_CATEGORIES,
  getBookingSummaryServiceLabel,
  getServiceLabel,
  inferServiceGroupFromServiceId,
  inferServiceTypeFromServiceId,
  parseBookingServiceId,
} from "@/components/booking/serviceCategories";

describe("booking service identity", () => {
  it("exposes the exact active bookable service ids", () => {
    expect(BOOKING_SERVICE_IDS).toEqual(["standard", "airbnb", "deep", "move", "carpet"]);
    expect(SERVICE_CATEGORIES.flatMap((category) => category.services.map((service) => service.id))).toEqual(
      BOOKING_SERVICE_IDS,
    );
    expect(BOOKING_SERVICE_IDS).not.toContain("quick");
  });

  it("keeps Standard and Airbnb isolated", () => {
    expect(inferServiceTypeFromServiceId("standard")).toBe("standard_cleaning");
    expect(inferServiceTypeFromServiceId("airbnb")).toBe("airbnb_cleaning");
    expect(inferServiceGroupFromServiceId("standard")).toBe("regular");
    expect(inferServiceGroupFromServiceId("airbnb")).toBe("regular");
    expect(getServiceLabel("standard")).toBe("Standard Cleaning");
    expect(getBookingSummaryServiceLabel("standard", inferServiceTypeFromServiceId("standard"))).toBe(
      "Standard Cleaning",
    );
  });

  it("does not parse retired quick aliases as active service ids", () => {
    expect(parseBookingServiceId("quick")).toBeNull();
    expect(parseBookingServiceId("quick_cleaning")).toBeNull();
    expect(parseBookingServiceId("Quick Cleaning")).toBeNull();
    expect(parseBookingServiceId("standard_cleaning")).toBe("standard");
    expect(parseBookingServiceId("airbnb_cleaning")).toBe("airbnb");
  });
});
