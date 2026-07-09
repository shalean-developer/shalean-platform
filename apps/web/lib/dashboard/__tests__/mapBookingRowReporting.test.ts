import { describe, expect, it } from "vitest";
import { mapBookingRow } from "@/lib/dashboard/bookingUtils";
import type { BookingRow } from "@/lib/dashboard/types";

describe("mapBookingRow reporting duration", () => {
  it("does not default missing duration to 2 hours", () => {
    const mapped = mapBookingRow({
      id: "b1",
      status: "confirmed",
      date: "2026-07-01",
      time: "10:00",
      created_at: "2026-06-01T08:00:00.000Z",
    } as BookingRow);
    expect(mapped.durationHours).toBeNull();
  });

  it("uses persisted duration_minutes for durationHours", () => {
    const mapped = mapBookingRow({
      id: "b2",
      status: "confirmed",
      date: "2026-07-01",
      time: "10:00",
      duration_minutes: 150,
      created_at: "2026-06-01T08:00:00.000Z",
    } as BookingRow);
    expect(mapped.durationHours).toBe(2.5);
  });
});
