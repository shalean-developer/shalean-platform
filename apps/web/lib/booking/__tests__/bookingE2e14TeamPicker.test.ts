import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-14 Deep/Moving customer team picker", () => {
  it("does not auto-assign teams on the customer schedule or review surfaces", () => {
    const step2 = read("src/features/booking-v2/steps/Step2Schedule.tsx");
    const step3 = read("src/features/booking-v2/steps/Step3Review.tsx");

    expect(step2).toContain("<TeamAvailabilitySection");
    expect(step3).toContain("<TeamAvailabilitySection");
    expect(step2).not.toMatch(/<TeamAvailabilitySection[\s\S]{0,500}\bautoAssign\b/);
    expect(step3).not.toMatch(/<TeamAvailabilitySection[\s\S]{0,500}\bautoAssign\b/);
  });

  it("shows customer-facing team choice and clears stale unavailable selections", () => {
    const src = read("src/features/booking-v2/components/TeamAvailabilitySection.tsx");

    expect(src).toContain("Choose your cleaning team");
    expect(src).toContain("Select one available team for this service.");
    expect(src).toContain('onSelect("", "")');
  });

  it("filters the dispatch team pool by the requested deep or moving service", () => {
    const src = read("lib/dispatch/loadDispatchTeamsForBooking.ts");

    expect(src).toContain("teamServiceTypeMatchesBookingV2Slug");
    expect(src).toContain("opts.serviceSlug");
  });

  it("does not show a stale team name in the summary before a valid team is selected", () => {
    const src = read("src/features/booking-v2/components/BookingV2SummaryPanel.tsx");

    expect(src).toContain('values.cleanerMode === "team" ? Boolean(values.assignedTeamId?.trim())');
  });
});
