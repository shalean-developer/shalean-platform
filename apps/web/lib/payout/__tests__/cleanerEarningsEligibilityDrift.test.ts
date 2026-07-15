import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOOKING_EXTRA_ID_SET } from "@/lib/pricing/extrasConfig";
import {
  resolveCanonicalCleanerPayout,
  type CanonicalPayoutResult,
} from "@/lib/payout/canonicalCleanerPayout";
import {
  resolveCleanerEarningsEligibility,
  type CleanerEarningsEligibilityInput,
} from "@/lib/payout/cleanerEarningsEligibility";
import { sumEligibleLineItemsSubtotalCents } from "@/lib/payout/computeEarningsFromLineItems";

const webRoot = path.resolve(__dirname, "../../..");

const EXPECTED_EXTRA_ELIGIBILITY: Record<string, "cleaner_eligible" | "cleaner_ineligible"> = {
  "inside-cabinets": "cleaner_eligible",
  "inside-oven": "cleaner_eligible",
  "inside-fridge": "cleaner_eligible",
  "interior-walls": "cleaner_eligible",
  ironing: "cleaner_eligible",
  laundry: "cleaner_eligible",
  "interior-windows": "cleaner_eligible",
  "water-plants": "cleaner_eligible",
  "inside-wardrobes": "cleaner_eligible",
  "blinds-cleaning": "cleaner_eligible",
  "balcony-cleaning": "cleaner_eligible",
  "carpet-cleaning": "cleaner_eligible",
  "ceiling-cleaning": "cleaner_eligible",
  "garage-cleaning": "cleaner_eligible",
  "mattress-cleaning": "cleaner_eligible",
  "outside-windows": "cleaner_eligible",
  "deposit-preparation": "cleaner_eligible",
  "appliances-cleaning": "cleaner_eligible",
  "office-kitchen": "cleaner_eligible",
  "office-sanitisation": "cleaner_eligible",
  "waste-removal": "cleaner_eligible",
  "stain-treatment": "cleaner_eligible",
  "pet-odour-treatment": "cleaner_eligible",
  "fabric-protector": "cleaner_eligible",
  "welcome-setup": "cleaner_eligible",
  "inspection-photos": "cleaner_eligible",
  "extra-cleaner": "cleaner_ineligible",
  "supplies-kit": "cleaner_ineligible",
};

const FEE_CASES: Array<{ name: string; expectedCategory?: string }> = [
  { name: "Service fee", expectedCategory: "service_fee" },
  { name: "Platform fee", expectedCategory: "platform_fee" },
  { name: "Admin fee", expectedCategory: "admin_fee" },
  { name: "Payment processing fee", expectedCategory: "payment_processing_fee" },
  { name: "Customer convenience fee", expectedCategory: "customer_convenience_fee" },
  { name: "Cancellation fee", expectedCategory: "cancellation_fee" },
  { name: "Reminder fee", expectedCategory: "reminder_fee" },
  { name: "Late-payment fee" },
  { name: "VAT-only line", expectedCategory: "tax_or_vat" },
];

const SURGE_CASES: Array<CleanerEarningsEligibilityInput & { expected: "cleaner_eligible" | "cleaner_ineligible" }> = [
  { item_type: "adjustment", surge_type: "cleaner_related_surge", expected: "cleaner_eligible" },
  { item_type: "adjustment", surge_type: "company_only_surge", expected: "cleaner_ineligible" },
  { item_type: "adjustment", metadata: { surge_type: "cleaner_related_surge" }, expected: "cleaner_eligible" },
  { item_type: "adjustment", metadata: { surge_type: "company_only_surge" }, expected: "cleaner_ineligible" },
];

function standardPayout(serviceId: "standard" | "airbnb", lineSubtotalCents: number): CanonicalPayoutResult {
  return resolveCanonicalCleanerPayout({
    serviceId,
    cleanerJoinedAtIso: "2025-01-01T00:00:00.000Z",
    bookingAppointmentIsoUtc: "2026-01-20T09:00:00.000Z",
    bookingValueCents: lineSubtotalCents,
    isTeamJob: false,
  });
}

describe("cleaner earnings eligibility drift scanners", () => {
  it("classifies every registered booking extra slug", () => {
    const registered = [...BOOKING_EXTRA_ID_SET].sort();
    const expected = Object.keys(EXPECTED_EXTRA_ELIGIBILITY).sort();

    expect(registered).toEqual(expected);

    for (const slug of registered) {
      const r = resolveCleanerEarningsEligibility({ item_type: "extra", slug });
      expect(r.eligibility, `${slug} should not be unknown`).not.toBe("unknown_unclassified");
      expect(r.eligibility, `${slug} eligibility drifted`).toBe(EXPECTED_EXTRA_ELIGIBILITY[slug]);
    }
  });

  it("detects unknown extra slugs as unclassified", () => {
    const r = resolveCleanerEarningsEligibility({ item_type: "extra", slug: "new-unclassified-extra" });

    expect(r.eligibility).toBe("unknown_unclassified");
    expect(r.category).toBe("unknown");
  });

  it("keeps all production adjustment names classified and ineligible by default", () => {
    const sources = [
      path.join(webRoot, "lib/booking/buildBookingLineItems.ts"),
      path.join(webRoot, "lib/booking/buildBookingLineItemsFromRow.ts"),
    ];
    const adjustmentNames = new Set<string>();

    for (const file of sources) {
      const src = readFileSync(file, "utf8");
      const matches = src.matchAll(/item_type:\s*"adjustment"[\s\S]*?name:\s*"([^"]+)"/g);
      for (const match of matches) {
        adjustmentNames.add(match[1]!);
      }
    }

    expect([...adjustmentNames].sort()).toEqual([
      "Backfill total reconciliation",
      "Bundle / combo adjustment (extras)",
      "Line total reconciliation",
      "Subtotal reconciliation (rounding)",
      "Surge, slot demand & fees",
    ]);

    for (const name of adjustmentNames) {
      const r = resolveCleanerEarningsEligibility({ item_type: "adjustment", name });
      expect(r.eligibility, `${name} must not be cleaner eligible`).toBe("cleaner_ineligible");
      expect(r.eligibility, `${name} should not be unknown`).not.toBe("unknown_unclassified");
    }
  });

  it("classifies required fee categories as cleaner ineligible", () => {
    for (const fee of FEE_CASES) {
      const r = resolveCleanerEarningsEligibility({ item_type: "adjustment", name: fee.name });
      expect(r.eligibility, fee.name).toBe("cleaner_ineligible");
      expect(r.category, fee.name).not.toBe("unknown");
      if (fee.expectedCategory) {
        expect(r.category, fee.name).toBe(fee.expectedCategory);
      }
    }
  });

  it("classifies required surge types", () => {
    for (const row of SURGE_CASES) {
      const { expected, ...input } = row;
      const r = resolveCleanerEarningsEligibility(input);
      expect(r.eligibility).toBe(expected);
      expect(r.eligibility).not.toBe("unknown_unclassified");
    }
  });

  it("prevents unsafe cleaner-eligible generic adjustments", () => {
    const unsafeAdjustments: CleanerEarningsEligibilityInput[] = [
      { item_type: "adjustment", name: "Manual adjustment" },
      { item_type: "adjustment", name: "Surge, slot demand & fees" },
      { item_type: "adjustment", name: "Line total reconciliation" },
      { item_type: "adjustment", name: "Bundle / combo adjustment (extras)" },
    ];

    for (const input of unsafeAdjustments) {
      expect(resolveCleanerEarningsEligibility(input).eligibility).not.toBe("cleaner_eligible");
    }
  });

  it("pins exclusion regressions for supplies-kit, extra-cleaner, generic adjustments, and fees", () => {
    const cases: CleanerEarningsEligibilityInput[] = [
      { item_type: "extra", slug: "supplies-kit" },
      { item_type: "extra", slug: "extra-cleaner" },
      { item_type: "adjustment", name: "Generic adjustment" },
      { item_type: "adjustment", name: "Service fee" },
      { item_type: "adjustment", name: "Platform fee" },
      { item_type: "adjustment", name: "Admin fee" },
    ];

    for (const input of cases) {
      expect(resolveCleanerEarningsEligibility(input).eligibility).toBe("cleaner_ineligible");
    }
  });

  it("keeps Deep, Move, and Carpet as fixed-compensation services", () => {
    for (const serviceId of ["deep", "move", "carpet"] as const) {
      const payout = resolveCanonicalCleanerPayout({
        serviceId,
        cleanerJoinedAtIso: "2025-01-01T00:00:00.000Z",
        bookingAppointmentIsoUtc: "2026-01-20T09:00:00.000Z",
        bookingValueCents: 100_000,
        isTeamJob: false,
      });

      expect(payout.payoutType).toBe("fixed_special");
      expect(payout.displayEarningsCents).toBe(25_000);
      expect(payout.cleanerPayoutCents).toBe(25_000);
      expect(payout.cleanerBonusCents).toBe(0);
      expect(payout.payoutPercentage).toBeNull();
    }
  });

  it("keeps Standard and Airbnb line basis eligibility-driven", () => {
    const lineSubtotal = sumEligibleLineItemsSubtotalCents([
      { id: "base", item_type: "base", total_price_cents: 30_000 },
      { id: "rooms", item_type: "room", total_price_cents: 10_000 },
      { id: "bathrooms", item_type: "bathroom", total_price_cents: 5_000 },
      { id: "oven", item_type: "extra", slug: "inside-oven", total_price_cents: 5_000 },
      { id: "supplies", item_type: "extra", slug: "supplies-kit", total_price_cents: 3_990 },
      { id: "extra-cleaner", item_type: "extra", slug: "extra-cleaner", total_price_cents: 29_900 },
      { id: "fee", item_type: "adjustment", name: "Service fee", total_price_cents: 5_000 },
    ]);

    expect(lineSubtotal).toBe(50_000);
    expect(standardPayout("standard", lineSubtotal).displayEarningsCents).toBe(30_000);
    expect(standardPayout("airbnb", lineSubtotal).displayEarningsCents).toBe(30_000);
  });
});
