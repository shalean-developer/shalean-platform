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
      } as BookingSnapshotV1["locked"],
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
});
