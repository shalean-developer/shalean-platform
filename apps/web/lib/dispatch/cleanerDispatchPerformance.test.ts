import { describe, expect, it } from "vitest";
import { computeDispatchPerformance01 } from "@/lib/dispatch/cleanerDispatchPerformance";

describe("computeDispatchPerformance01", () => {
  it("returns neutral when sample too small", () => {
    expect(
      computeDispatchPerformance01({
        n: 2,
        accepted: 1,
        rejected: 0,
        expired: 0,
        withRead: 1,
        withDelivered: 1,
        ignoredReadExpired: 0,
        avgResponseLatencyMs: 10_000,
      }),
    ).toBe(0.5);
  });

  it("ranks high accept + read cleaners above baseline", () => {
    const high = computeDispatchPerformance01({
      n: 20,
      accepted: 16,
      rejected: 2,
      expired: 2,
      withRead: 18,
      withDelivered: 17,
      ignoredReadExpired: 0,
      avgResponseLatencyMs: 12_000,
    });
    const low = computeDispatchPerformance01({
      n: 20,
      accepted: 4,
      rejected: 8,
      expired: 8,
      withRead: 6,
      withDelivered: 5,
      ignoredReadExpired: 4,
      avgResponseLatencyMs: 90_000,
    });
    expect(high).toBeGreaterThan(low);
  });
});
