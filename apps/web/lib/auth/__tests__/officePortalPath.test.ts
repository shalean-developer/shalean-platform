import { describe, expect, it } from "vitest";
import { isOfficePortalPath } from "@/lib/auth/officePortalPath";

describe("isOfficePortalPath", () => {
  it("matches admin console routes only", () => {
    expect(isOfficePortalPath("/office")).toBe(true);
    expect(isOfficePortalPath("/office/bookings")).toBe(true);
    expect(isOfficePortalPath("/office/")).toBe(true);
  });

  it("does not match Stage 19 office-cleaning SEO landings", () => {
    expect(isOfficePortalPath("/office-cleaning")).toBe(false);
    expect(isOfficePortalPath("/office-cleaning/sea-point")).toBe(false);
  });
});
