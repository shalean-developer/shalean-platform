import { describe, expect, it } from "vitest";
import { payoutGenerationAvailability as availability } from "../payoutGenerationAvailability";

describe("monthly generation availability", () => {
  it("shows October as payment-ready but blocks generation before Johannesburg closure", () => {
    expect(availability("2026-10-01", "2026-10-31", new Date("2026-10-31T21:59:59Z")))
      .toEqual({ hasClosedProcessingMonth: false, rangeCanGenerate: false, monthLabel: "October" });
  });
  it("opens October at exactly midnight Johannesburg on November 1", () => {
    expect(availability("2026-10-01", "2026-10-31", new Date("2026-10-31T22:00:00Z")))
      .toEqual({ hasClosedProcessingMonth: true, rangeCanGenerate: true, monthLabel: null });
  });
  it("keeps November blocked while allowing global October catch-up", () => {
    expect(availability("2026-11-01", "2026-11-30", new Date("2026-11-15T12:00:00Z")))
      .toEqual({ hasClosedProcessingMonth: true, rangeCanGenerate: false, monthLabel: "November" });
  });
  it("does not call mixed open/closed reporting totals ready to generate", () => {
    expect(availability("2026-10-01", "2026-11-30", new Date("2026-11-15T12:00:00Z")).rangeCanGenerate).toBe(false);
  });
  it("rejects historical, invalid and reversed report ranges", () => {
    for (const [from, to] of [["2026-09-01","2026-09-30"],["bad","2026-10-31"],["2026-10-31","2026-10-01"]]) {
      expect(availability(from,to,new Date("2026-12-01T12:00:00Z")).rangeCanGenerate).toBe(false);
    }
  });
});
