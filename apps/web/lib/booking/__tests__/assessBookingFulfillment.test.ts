import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessBookingFulfillment } from "@/lib/booking/assessBookingFulfillment";
import { countEligibleCleaners } from "@/lib/booking/getEligibleCleaners";
import { countOpsAssignableCleaners } from "@/lib/booking/countOpsAssignableCleaners";
import { isBookingSoftFulfillmentEnabled } from "@/lib/booking/availabilityFlags";

vi.mock("@/lib/booking/getEligibleCleaners", () => ({
  countEligibleCleaners: vi.fn(),
}));
vi.mock("@/lib/booking/countOpsAssignableCleaners", () => ({
  countOpsAssignableCleaners: vi.fn(),
}));
vi.mock("@/lib/booking/availabilityFlags", () => ({
  isBookingSoftFulfillmentEnabled: vi.fn(() => true),
}));

describe("assessBookingFulfillment", () => {
  const admin = {} as never;
  const base = {
    date: "2026-08-20",
    startTime: "09:00",
    durationMinutes: 120,
    locationId: "00000000-0000-4000-8000-000000000010",
    locationExpandedIds: ["00000000-0000-4000-8000-000000000010"],
    serviceType: "standard",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBookingSoftFulfillmentEnabled).mockReturnValue(true);
  });

  it("returns instant when eligible cleaners exist", async () => {
    vi.mocked(countEligibleCleaners).mockResolvedValue(2);
    const r = await assessBookingFulfillment(admin, base);
    expect(r.mode).toBe("instant");
    expect(r.requiresPayment).toBe(true);
    expect(countOpsAssignableCleaners).not.toHaveBeenCalled();
  });

  it("returns ops_assignment when soft on and ops coverage exists", async () => {
    vi.mocked(countEligibleCleaners).mockResolvedValue(0);
    vi.mocked(countOpsAssignableCleaners).mockResolvedValue(3);
    const r = await assessBookingFulfillment(admin, base);
    expect(r.mode).toBe("ops_assignment");
    expect(r.requiresPayment).toBe(true);
    expect(r.customerMessage).toMatch(/assign/i);
  });

  it("returns area_review when soft on and no coverage", async () => {
    vi.mocked(countEligibleCleaners).mockResolvedValue(0);
    vi.mocked(countOpsAssignableCleaners).mockResolvedValue(0);
    const r = await assessBookingFulfillment(admin, base);
    expect(r.mode).toBe("area_review");
    expect(r.requiresPayment).toBe(false);
  });

  it("does not soft-route when soft fulfillment disabled", async () => {
    vi.mocked(isBookingSoftFulfillmentEnabled).mockReturnValue(false);
    vi.mocked(countEligibleCleaners).mockResolvedValue(0);
    const r = await assessBookingFulfillment(admin, { ...base, softFulfillment: false });
    expect(r.mode).toBe("instant");
    expect(r.reason).toBe("no_eligible_cleaner_soft_disabled");
    expect(countOpsAssignableCleaners).not.toHaveBeenCalled();
  });
});
