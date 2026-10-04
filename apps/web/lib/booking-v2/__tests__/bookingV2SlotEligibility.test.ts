import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessBookingFulfillment } from "@/lib/booking/assessBookingFulfillment";
import { assessBookingV2SlotFulfillment } from "@/lib/booking-v2/bookingV2SlotEligibility";

vi.mock("@/lib/booking/assessBookingFulfillment", () => ({
  assessBookingFulfillment: vi.fn(),
}));

describe("assessBookingV2SlotFulfillment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes a known service area without cleaner coverage to payable operations assignment", async () => {
    vi.mocked(assessBookingFulfillment).mockResolvedValue({
      mode: "area_review",
      reason: "no_active_cleaner_coverage",
      instantCount: 0,
      opsCount: 0,
      requiresPayment: false,
      customerMessage: "Review required.",
    });

    const result = await assessBookingV2SlotFulfillment({} as never, {
      serviceSlug: "regular-cleaning",
      date: "2026-09-25",
      time: "10:00",
      durationMinutes: 240,
      location: {
        locationId: "00000000-0000-4000-8000-000000000010",
        cityId: "00000000-0000-4000-8000-000000000020",
        latitude: null,
        longitude: null,
      },
    });

    expect(result).toMatchObject({
      mode: "ops_assignment",
      reason: "known_area_pending_ops_assignment",
      requiresPayment: true,
      instantCount: 0,
      opsCount: 0,
    });
    expect(result.customerMessage).toMatch(/assign/i);
  });

  it("preserves instant fulfillment when a cleaner is eligible", async () => {
    vi.mocked(assessBookingFulfillment).mockResolvedValue({
      mode: "instant",
      reason: "eligible_cleaner_available",
      instantCount: 1,
      opsCount: 1,
      requiresPayment: true,
      customerMessage: "",
    });

    const result = await assessBookingV2SlotFulfillment({} as never, {
      serviceSlug: "regular-cleaning",
      date: "2026-09-25",
      time: "10:00",
      location: {
        locationId: "00000000-0000-4000-8000-000000000010",
        cityId: null,
        latitude: null,
        longitude: null,
      },
    });

    expect(result.mode).toBe("instant");
    expect(result.requiresPayment).toBe(true);
  });
});
