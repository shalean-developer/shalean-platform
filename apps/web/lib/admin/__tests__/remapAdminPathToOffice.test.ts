import { describe, expect, it } from "vitest";
import { remapAdminPathToOffice } from "../remapAdminPathToOffice";

describe("remapAdminPathToOffice", () => {
  it("maps dashboard root", () => {
    expect(remapAdminPathToOffice("/admin")).toBe("/office");
    expect(remapAdminPathToOffice("/admin/")).toBe("/office");
  });

  it("maps generic admin paths", () => {
    expect(remapAdminPathToOffice("/admin/bookings")).toBe("/office/bookings");
    expect(remapAdminPathToOffice("/admin/bookings/abc")).toBe("/office/bookings/abc");
  });

  it("maps renamed ops paths", () => {
    expect(remapAdminPathToOffice("/admin/ops/sla-breaches")).toBe("/office/sla-breaches");
    expect(remapAdminPathToOffice("/admin/ops/cleaner-performance")).toBe("/office/cleaner-performance");
    expect(remapAdminPathToOffice("/admin/reviews/analytics")).toBe("/office/review-funnel");
  });

  it("maps legacy cleaner manage and payout runs", () => {
    expect(remapAdminPathToOffice("/admin/cleaners/manage")).toBe("/office/cleaners");
    expect(remapAdminPathToOffice("/admin/payout-runs")).toBe("/office/payouts");
  });
});
