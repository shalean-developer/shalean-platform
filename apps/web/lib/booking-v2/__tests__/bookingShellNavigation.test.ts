import { describe, expect, it } from "vitest";
import { shouldShowBookingShellNavigation } from "@/lib/booking-v2/bookingShellNavigation";

describe("booking shell navigation", () => {
  it.each(["regular-cleaning", "deep-cleaning"] as const)(
    "hides generic navigation during progressive details and schedule for %s",
    (serviceSlug) => {
      expect(shouldShowBookingShellNavigation(1, serviceSlug)).toBe(false);
      expect(shouldShowBookingShellNavigation(2, serviceSlug)).toBe(false);
    },
  );

  it("keeps generic navigation for non-progressive services", () => {
    expect(shouldShowBookingShellNavigation(1, "moving-cleaning")).toBe(true);
  });

  it.each(["regular-cleaning", "deep-cleaning"] as const)(
    "restores shell navigation after schedule for %s",
    (serviceSlug) => {
      expect(shouldShowBookingShellNavigation(3, serviceSlug)).toBe(true);
      expect(shouldShowBookingShellNavigation(4, serviceSlug)).toBe(true);
    },
  );
});
