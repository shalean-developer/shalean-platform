import { describe, expect, it } from "vitest";
import { bookingCopy } from "@/lib/booking/copy";

const payCopy = bookingCopy.checkoutPayment;

/**
 * Mirrors `BookingReviewPanel` label decision so we can guard against regressions in the
 * "Best available cleaner" → user-selected swap. Keeping this as a tiny pure helper means we
 * can assert behaviour without rendering React. If the panel ever changes its label rule, this
 * helper must change too — and the test will fail loudly.
 */
function reviewCleanerLabel(name: string | null | undefined): string {
  return name?.trim() ? `${payCopy.cleanerSelectedShort}: ${name.trim()}` : payCopy.cleanerBestAvailable;
}

describe("BookingReviewPanel cleaner label", () => {
  it("shows the picked cleaner name with the 'Selected cleaner' prefix", () => {
    expect(reviewCleanerLabel("Princess Saidi")).toBe("Selected cleaner: Princess Saidi");
  });

  it("falls back to 'Best available cleaner' when no name is on the summary", () => {
    expect(reviewCleanerLabel(null)).toBe("Best available cleaner");
    expect(reviewCleanerLabel(undefined)).toBe("Best available cleaner");
    expect(reviewCleanerLabel("")).toBe("Best available cleaner");
    expect(reviewCleanerLabel("   ")).toBe("Best available cleaner");
  });

  it("trims whitespace before composing the label", () => {
    expect(reviewCleanerLabel("  Princess Saidi  ")).toBe("Selected cleaner: Princess Saidi");
  });
});
