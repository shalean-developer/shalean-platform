import { describe, expect, it } from "vitest";
import {
  buildBookingNotifyFieldsFromRow,
  formatAdminDateTimeLine,
  resolveBookingEmailLabelsFromRow,
} from "@/lib/notifications/bookingNotifyFormat";

describe("bookingNotifyFormat", () => {
  it("formatAdminDateTimeLine avoids duplicate dashes", () => {
    expect(formatAdminDateTimeLine("—", "—")).toBe("—");
    expect(formatAdminDateTimeLine("Mon 21 Jun", "09:00")).toBe("Mon 21 Jun 09:00");
  });

  it("buildBookingNotifyFieldsFromRow reads booking-v2 snapshot", () => {
    const fields = buildBookingNotifyFieldsFromRow("booking-1", {
      booking_snapshot: {
        serviceSlug: "deep-cleaning",
        address: "12 Main Rd",
        suburb: "Sea Point",
        date: "2026-06-21",
        time: "14:30:00",
      },
    });
    expect(fields.service).toBe("Deep Cleaning");
    expect(fields.date).toContain("Jun");
    expect(fields.time).toBe("14:30");
    expect(fields.address).toContain("12 Main Rd");
  });

  it("resolveBookingEmailLabelsFromRow falls back to row columns", () => {
    const labels = resolveBookingEmailLabelsFromRow({
      service_slug: "regular-cleaning",
      date: "2026-06-21",
      time: "09:00:00",
      location: "45 Beach Rd",
      suburb: "Camps Bay",
    });
    expect(labels.serviceLabel).toBe("Regular Cleaning");
    expect(labels.dateLabel).toContain("Jun");
    expect(labels.timeLabel).toBe("09:00");
    expect(labels.location).toContain("45 Beach Rd");
  });
});
