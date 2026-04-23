import { describe, it, expect } from "vitest";
import { bookingStartUtcMs, formatWhenForCustomerCopy } from "@/lib/notifications/notificationCopy";

describe("notificationCopy", () => {
  it("bookingStartUtcMs parses SAST wall time", () => {
    const ms = bookingStartUtcMs("2026-06-01", "10:00");
    expect(ms).not.toBeNull();
    expect(new Date(ms!).toISOString()).toContain("2026-06-01T08:00:00.000Z");
  });

  it("formatWhenForCustomerCopy includes time", () => {
    const s = formatWhenForCustomerCopy("2099-01-15", "14:30");
    expect(s).toContain("14:30");
  });
});
