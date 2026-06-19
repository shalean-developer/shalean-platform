import { describe, expect, it } from "vitest";
import { countScheduledDemand, computeWeekSupplyDemand } from "@/lib/admin/officeOperations";
import type { OfficeScheduleDayBooking, OfficeScheduleDayCleaner } from "@/lib/admin/officeScheduleDayPresentation";

function booking(
  overrides: Partial<OfficeScheduleDayBooking> & Pick<OfficeScheduleDayBooking, "id" | "date" | "status">,
): OfficeScheduleDayBooking {
  return {
    time: "09:00",
    cleaner_id: null,
    selected_cleaner_id: null,
    team_id: null,
    is_team_job: false,
    customer_name: null,
    service: null,
    location: null,
    dispatch_status: null,
    ...overrides,
  };
}

function cleaner(overrides: Partial<OfficeScheduleDayCleaner> & Pick<OfficeScheduleDayCleaner, "id">): OfficeScheduleDayCleaner {
  return {
    full_name: "Cleaner",
    is_available: true,
    status: "available",
    availability_weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    ...overrides,
  };
}

describe("countScheduledDemand", () => {
  it("excludes cancelled and failed bookings", () => {
    const demand = countScheduledDemand([
      booking({ id: "1", date: "2026-06-19", status: "assigned" }),
      booking({ id: "2", date: "2026-06-19", status: "cancelled" }),
      booking({ id: "3", date: "2026-06-19", status: "failed" }),
      booking({ id: "4", date: "2026-06-19", status: "payment_expired" }),
    ]);
    expect(demand).toBe(1);
  });
});

describe("computeWeekSupplyDemand", () => {
  it("varies supply by weekday roster and day bookings", () => {
    const today = "2026-06-18"; // Thursday
    const cleaners: OfficeScheduleDayCleaner[] = [
      cleaner({ id: "c1", availability_weekdays: ["thu"] }),
      cleaner({ id: "c2", availability_weekdays: ["fri"] }),
    ];
    const weekBookings: OfficeScheduleDayBooking[] = [
      booking({ id: "b1", date: today, status: "assigned", cleaner_id: "c1" }),
      booking({ id: "b2", date: "2026-06-19", status: "assigned", cleaner_id: "c2" }),
    ];

    const rows = computeWeekSupplyDemand(cleaners, weekBookings, today, 2);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.date).toBe(today);
    expect(rows[0]?.demand).toBe(1);
    expect(rows[0]?.supply).toBe(0);
    expect(rows[1]?.date).toBe("2026-06-19");
    expect(rows[1]?.demand).toBe(1);
    expect(rows[1]?.supply).toBe(0);
  });

  it("counts idle rostered cleaners as supply", () => {
    const today = "2026-06-18"; // Thursday
    const cleaners: OfficeScheduleDayCleaner[] = [
      cleaner({ id: "c1", availability_weekdays: ["thu"] }),
      cleaner({ id: "c2", availability_weekdays: ["thu"], is_available: false }),
    ];

    const rows = computeWeekSupplyDemand(cleaners, [], today, 1);
    expect(rows[0]?.supply).toBe(1);
    expect(rows[0]?.demand).toBe(0);
  });
});
