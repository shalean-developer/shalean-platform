import { describe, expect, it } from "vitest";
import {
  BOOKING_SERVICE_QA_DEEP_SECTIONS,
  BOOKING_SERVICE_QA_MOVE_SECTIONS,
  resolveBookingServiceQaProfile,
} from "@/lib/booking/bookingServiceQa";

describe("resolveBookingServiceQaProfile", () => {
  it("returns deep sections for slug deep", () => {
    const p = resolveBookingServiceQaProfile("deep", null);
    expect(p?.kind).toBe("deep");
    expect(p?.sections).toEqual([...BOOKING_SERVICE_QA_DEEP_SECTIONS]);
  });

  it("returns move sections for slug move", () => {
    const p = resolveBookingServiceQaProfile("move", null);
    expect(p?.kind).toBe("move");
    expect(p?.sections).toEqual([...BOOKING_SERVICE_QA_MOVE_SECTIONS]);
  });

  it("infers from label when slug missing", () => {
    expect(resolveBookingServiceQaProfile(null, "Deep Cleaning")?.kind).toBe("deep");
    expect(resolveBookingServiceQaProfile(null, "Move In/Out Cleaning")?.kind).toBe("move");
  });

  it("returns null for standard-style services", () => {
    expect(resolveBookingServiceQaProfile("standard", "Standard Cleaning")).toBeNull();
  });
});
