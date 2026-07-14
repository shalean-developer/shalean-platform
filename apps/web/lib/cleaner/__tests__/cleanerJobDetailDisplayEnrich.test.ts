import { describe, expect, it } from "vitest";
import {
  cleanerJobServiceDetailLines,
  formatCleanerJobLocationDisplay,
  syncSoloCleanerDisplayEarningsPreviewCents,
} from "@/lib/cleaner/cleanerJobDetailDisplayEnrich";
import { durationHoursFromBookingRecord } from "@/lib/cleaner/cleanerMobileBookingMap";

describe("formatCleanerJobLocationDisplay", () => {
  it("joins street and suburb when stored separately", () => {
    expect(
      formatCleanerJobLocationDisplay({
        location: "39 Harvey Road",
        suburb: "Claremont",
      }),
    ).toBe("39 Harvey Road, Claremont");
  });
});

describe("durationHoursFromBookingRecord", () => {
  it("reads estimated_duration_minutes from a structured pricing_summary", () => {
    expect(
      durationHoursFromBookingRecord({
        booking_snapshot: null,
        pricing_summary: {
          base_service_price: 250,
          estimated_total: 460,
          estimated_duration_minutes: 330,
        },
      }),
    ).toBe(5.5);
  });

  it("ignores sparse unstructured pricing_summary and falls back to snapshot default hours", () => {
    // Sparse fixtures without base_service_price + estimated_total are not structured
    // breakdowns; duration must not invent hours from a lone estimated_duration_minutes key.
    expect(
      durationHoursFromBookingRecord({
        booking_snapshot: null,
        pricing_summary: { estimated_duration_minutes: 330 },
      }),
    ).toBe(2);
  });

  it("prefers duration_minutes column over pricing_summary", () => {
    expect(
      durationHoursFromBookingRecord({
        duration_minutes: 180,
        booking_snapshot: null,
        pricing_summary: {
          base_service_price: 250,
          estimated_total: 460,
          estimated_duration_minutes: 330,
        },
      }),
    ).toBe(3);
  });
});

describe("cleanerJobServiceDetailLines", () => {
  it("formats booking-v2 service_details", () => {
    const lines = cleanerJobServiceDetailLines({
      service_details: {
        propertyType: "house",
        hasPets: "no",
        cleaningProducts: "yes",
      },
    });
    expect(lines.map((l) => l.label)).toEqual(
      expect.arrayContaining(["Property type", "Pets on site", "Cleaning products at home"]),
    );
  });
});

describe("syncSoloCleanerDisplayEarningsPreviewCents", () => {
  it("returns positive cents for paid v2 booking shape", () => {
    const cents = syncSoloCleanerDisplayEarningsPreviewCents({
      record: {
        service: "regular-cleaning",
        date: "2026-06-19",
        time: "09:00",
        total_paid_zar: 460,
        amount_paid_cents: 46000,
        base_amount_cents: 25000,
        service_fee_cents: 3000,
        booking_snapshot: { serviceSlug: "regular-cleaning", date: "2026-06-19", time: "09:00" },
      },
      cleanerJoinedAtIso: "2026-05-08T10:12:15.88947+00:00",
    });
    expect(typeof cents).toBe("number");
    expect(cents!).toBeGreaterThan(0);
  });
});
