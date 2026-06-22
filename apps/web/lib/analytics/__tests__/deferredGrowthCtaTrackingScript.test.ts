import { describe, expect, it } from "vitest";
import { deferredGrowthCtaTrackingInlineScript } from "@/lib/analytics/deferredGrowthCtaTrackingScript";

describe("deferredGrowthCtaTrackingInlineScript", () => {
  it("registers delegated start_booking tracking after idle", () => {
    const script = deferredGrowthCtaTrackingInlineScript();
    expect(script).toContain("requestIdleCallback");
    expect(script).toContain("[data-growth-cta-source]");
    expect(script).toContain('"start_booking"');
    expect(script).toContain("/api/analytics/event");
    expect(script).toContain("sendBeacon");
  });
});
