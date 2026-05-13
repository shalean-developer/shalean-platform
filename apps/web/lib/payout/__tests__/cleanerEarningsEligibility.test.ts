import { describe, expect, it } from "vitest";
import {
  lineItemContributesToCleanerEarnings,
  resolveCleanerEarningsEligibility,
} from "@/lib/payout/cleanerEarningsEligibility";

describe("resolveCleanerEarningsEligibility", () => {
  it("excludes supplies-kit equipment extras", () => {
    const r = resolveCleanerEarningsEligibility({
      item_type: "extra",
      slug: "supplies-kit",
      name: "Supplies kit",
    });

    expect(r.eligibility).toBe("cleaner_ineligible");
    expect(r.category).toBe("equipment_or_supplies");
    expect(lineItemContributesToCleanerEarnings({ item_type: "extra", slug: "supplies-kit" })).toBe(false);
  });

  it("excludes extra-cleaner fees from assigned-cleaner earnings", () => {
    const r = resolveCleanerEarningsEligibility({
      item_type: "extra",
      slug: "extra-cleaner",
      name: "Extra cleaner",
    });

    expect(r.eligibility).toBe("cleaner_ineligible");
    expect(r.category).toBe("extra_cleaner_fee");
  });

  it("excludes generic adjustments", () => {
    const r = resolveCleanerEarningsEligibility({
      item_type: "adjustment",
      name: "Subtotal reconciliation",
    });

    expect(r.eligibility).toBe("cleaner_ineligible");
    expect(r.category).toBe("generic_adjustment");
  });

  it("excludes service fee lines", () => {
    const r = resolveCleanerEarningsEligibility({
      item_type: "adjustment",
      name: "Service fee",
    });

    expect(r.eligibility).toBe("cleaner_ineligible");
    expect(r.category).toBe("service_fee");
  });

  it("includes known cleaner-eligible extras", () => {
    const r = resolveCleanerEarningsEligibility({
      item_type: "extra",
      slug: "inside-oven",
      name: "Inside oven",
    });

    expect(r.eligibility).toBe("cleaner_eligible");
    expect(r.category).toBe("cleaner_eligible_extra");
  });

  it("keeps legacy aggregate add-ons eligible until checkout stores per-extra line items", () => {
    const r = resolveCleanerEarningsEligibility({
      item_type: "extra",
      slug: null,
      name: "Add-ons (subtotal)",
    });

    expect(r.eligibility).toBe("cleaner_eligible");
    expect(r.category).toBe("legacy_extra_aggregate");
  });
});
