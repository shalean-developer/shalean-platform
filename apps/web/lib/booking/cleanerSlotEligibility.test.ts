import { describe, it, expect } from "vitest";
import {
  bookingMatchesEligibilityDate,
  cleanerAccountEligibleForCustomerBooking,
  cleanerHasOccupyingBookingOverlap,
  existingBookingOccupancyWindow,
  indexOccupyingBookingsByCleanerId,
  minutesRangesOverlap,
} from "@/lib/booking/cleanerSlotEligibility";

describe("cleanerAccountEligibleForCustomerBooking", () => {
  it("rejects inactive", () => {
    expect(cleanerAccountEligibleForCustomerBooking({ is_active: false, is_available: true, status: "available" })).toBe(
      false,
    );
  });

  it("allows busy workload status when manual availability is on (overlap checks handle conflicts)", () => {
    expect(cleanerAccountEligibleForCustomerBooking({ is_active: true, is_available: true, status: "busy" })).toBe(
      true,
    );
  });

  it("rejects offline lifecycle status", () => {
    expect(cleanerAccountEligibleForCustomerBooking({ is_active: true, is_available: true, status: "offline" })).toBe(
      false,
    );
  });

  it("rejects suspended-style statuses", () => {
    expect(cleanerAccountEligibleForCustomerBooking({ is_active: true, is_available: true, status: "suspended" })).toBe(
      false,
    );
  });

  it("accepts active available cleaner", () => {
    expect(cleanerAccountEligibleForCustomerBooking({ is_active: true, is_available: true, status: "available" })).toBe(
      true,
    );
  });
});

describe("existingBookingOccupancyWindow", () => {
  it("uses duration_minutes when end_time missing", () => {
    const w = existingBookingOccupancyWindow({
      time: "10:00",
      duration_minutes: 90,
    });
    expect(w).toEqual({ startMin: 10 * 60, endMin: 10 * 60 + 90 });
  });

  it("prefers explicit end_time", () => {
    const w = existingBookingOccupancyWindow({
      time: "10:00",
      end_time: "12:30",
    });
    expect(w).toEqual({ startMin: 10 * 60, endMin: 12 * 60 + 30 });
  });
});

describe("indexOccupyingBookingsByCleanerId + overlap", () => {
  it("indexes selected_cleaner_id holds", () => {
    const m = indexOccupyingBookingsByCleanerId([
      {
        id: "b1",
        cleaner_id: null,
        selected_cleaner_id: "c1",
        date: "2026-05-10",
        time: "09:00",
        duration_minutes: 60,
      },
    ]);
    expect(m.get("c1")?.length).toBe(1);
  });

  it("detects pending_assignment overlap on cleaner_id", () => {
    const m = indexOccupyingBookingsByCleanerId([
      {
        id: "b1",
        cleaner_id: "c1",
        selected_cleaner_id: null,
        date: "2026-05-10",
        time: "10:00",
        duration_minutes: 120,
      },
    ]);
    const slotStart = 11 * 60;
    const slotEnd = slotStart + 60;
    expect(cleanerHasOccupyingBookingOverlap(m.get("c1"), "2026-05-10", slotStart, slotEnd, null)).toBe(true);
  });

  it("respects excludeBookingId", () => {
    const m = indexOccupyingBookingsByCleanerId([
      {
        id: "self",
        cleaner_id: "c1",
        date: "2026-05-10",
        time: "10:00",
        duration_minutes: 60,
      },
    ]);
    expect(
      cleanerHasOccupyingBookingOverlap(m.get("c1"), "2026-05-10", 10 * 60, 11 * 60, "self"),
    ).toBe(false);
  });
});

describe("bookingMatchesEligibilityDate", () => {
  it("matches booking_date over date", () => {
    expect(
      bookingMatchesEligibilityDate(
        { booking_date: "2026-05-10", date: "2026-01-01" } as { booking_date?: string; date?: string },
        "2026-05-10",
      ),
    ).toBe(true);
  });
});

describe("minutesRangesOverlap", () => {
  it("returns false for adjacent non-overlapping", () => {
    expect(minutesRangesOverlap(600, 660, 660, 720)).toBe(false);
  });

  it("returns true for partial overlap", () => {
    expect(minutesRangesOverlap(600, 720, 660, 780)).toBe(true);
  });
});
