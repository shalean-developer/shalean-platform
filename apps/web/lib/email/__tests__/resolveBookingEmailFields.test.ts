import { describe, expect, it } from "vitest";
import { resolveBookingEmailFields } from "@/lib/email/resolveBookingEmailFields";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

describe("resolveBookingEmailFields", () => {
  it("prefers locked snapshot fields", () => {
    const snapshot: BookingSnapshotV1 = {
      v: 1,
      locked: {
        service: "regular-cleaning",
        date: "2026-06-21",
        time: "09:00",
        location: "12 Main Rd, Cape Town",
      } as unknown as BookingSnapshotV1["locked"],
    };
    const fields = resolveBookingEmailFields({ snapshot });
    expect(fields.dateLabel).toContain("Jun");
    expect(fields.timeLabel).toBe("09:00");
    expect(fields.location).toBe("12 Main Rd, Cape Town");
  });

  it("falls back to booking row when snapshot is sparse", () => {
    const fields = resolveBookingEmailFields({
      snapshot: { v: 1 },
      bookingRow: {
        date: "2026-06-21",
        time: "14:30:00",
        location: "45 Beach Rd",
        suburb: "Sea Point",
        service: "Deep Cleaning",
      },
    });
    expect(fields.dateLabel).toContain("Jun");
    expect(fields.timeLabel).toBe("14:30");
    expect(fields.location).toContain("45 Beach Rd");
    expect(fields.serviceLabel).toBe("Deep Cleaning");
  });

  it("uses flat snapshot mirror when locked is missing", () => {
    const fields = resolveBookingEmailFields({
      snapshot: {
        v: 1,
        flat: {
          service: null,
          rooms: null,
          bathrooms: null,
          extras: [],
          location: "Claremont",
          date: "2026-07-01",
          time: "11:00",
        },
      },
    });
    expect(fields.location).toBe("Claremont");
    expect(fields.timeLabel).toBe("11:00");
  });

  it("reads booking-v2 persisted snapshot when Paystack metadata snapshot is empty", () => {
    const fields = resolveBookingEmailFields({
      snapshot: { v: 1 },
      persistedSnapshot: {
        serviceSlug: "deep-cleaning",
        address: "12 Main Rd",
        suburb: "Sea Point",
        city: "Cape Town",
        date: "2026-06-21",
        time: "14:30:00",
      },
    });
    expect(fields.serviceLabel).toBe("Deep Cleaning");
    expect(fields.dateLabel).toContain("Jun");
    expect(fields.timeLabel).toBe("14:30");
    expect(fields.location).toContain("12 Main Rd");
    expect(fields.location).toContain("Sea Point");
  });

  it("coerces booking row date/time columns from Supabase values", () => {
    const fields = resolveBookingEmailFields({
      snapshot: null,
      bookingRow: {
        date: "2026-06-21" as unknown as string,
        time: "09:00:00" as unknown as string,
        location: "45 Beach Rd",
        suburb: "Camps Bay",
        service_slug: "regular-cleaning",
      },
    });
    expect(fields.dateLabel).toContain("Jun");
    expect(fields.timeLabel).toBe("09:00");
    expect(fields.serviceLabel).toBe("Regular Cleaning");
  });

  it("builds recurring summary from booking row frequency + days (notify/resend path)", () => {
    const fields = resolveBookingEmailFields({
      snapshot: null,
      bookingRow: {
        booking_type: "recurring",
        recurring_frequency: "weekly",
        recurring_days: ["Tuesday", "Thursday", "Saturday"],
        date: "2026-07-16",
        time: "09:00",
        location: "12 Main Rd",
        service: "Regular Cleaning",
      },
    });
    expect(fields.recurringSummary).toBe("Weekly · Tuesday • Thursday • Saturday");
  });

  it("builds recurring summary from persisted booking-v2 snapshot when row columns sparse", () => {
    const fields = resolveBookingEmailFields({
      snapshot: { v: 1 },
      bookingRow: { booking_type: "recurring" },
      persistedSnapshot: {
        recurringFrequency: "weekly",
        recurringDays: ["Tuesday", "Thursday", "Saturday"],
        date: "2026-07-16",
        time: "09:00",
        address: "12 Main Rd",
        serviceSlug: "regular-cleaning",
      },
    });
    expect(fields.recurringSummary).toBe("Weekly · Tuesday • Thursday • Saturday");
  });
});
