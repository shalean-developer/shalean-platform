import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/booking-v2/BookingV2Context.tsx"),
  "utf8",
);

describe("Booking V2 details section URL lifecycle", () => {
  it("uses the current browser URL when editing progressive details sections", () => {
    expect(source).toContain(
      'const params = new URLSearchParams(window.location.search);',
    );
    expect(source).toContain('params.set("section", section);');
  });

  it("prevents a section query from jumping ahead of unanswered required details", () => {
    expect(source).toContain("bookingDetailsStageIndex");
    expect(source).toContain(
      "bookingDetailsStageIndex(serviceSlug, requestedDetailsSection) >",
    );
    expect(source).toContain(
      "bookingDetailsStageIndex(serviceSlug, derivedStage)",
    );
    expect(source).toContain("safeStage = derivedStage;");
  });

  it("removes stale details section state after leaving Step 1", () => {
    expect(source).toContain('if (step === 1) {');
    expect(source).toContain(
      'if (detailsSectionOverride) params.set("section", detailsSectionOverride);',
    );
    expect(source).toContain('params.delete("section");');
  });
});
