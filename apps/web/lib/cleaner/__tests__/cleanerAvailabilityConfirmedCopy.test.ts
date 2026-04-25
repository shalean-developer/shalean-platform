import { describe, expect, it } from "vitest";
import { formatCleanerAvailabilityConfirmedMessage } from "@/lib/cleaner/cleanerAvailabilityConfirmedCopy";

describe("formatCleanerAvailabilityConfirmedMessage", () => {
  it("uses Johannesburg calendar for today vs tomorrow", () => {
    const now = new Date("2026-04-25T08:00:00+02:00");
    const msg = formatCleanerAvailabilityConfirmedMessage("2026-04-26", "08:00", now);
    expect(msg).toContain("tomorrow");
    expect(msg).toContain("08:00");
  });

  it("falls back when date invalid", () => {
    expect(formatCleanerAvailabilityConfirmedMessage("", "08:00")).toBe("✅ You're scheduled for this job.");
  });
});
