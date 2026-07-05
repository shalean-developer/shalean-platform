import { describe, expect, it } from "vitest";
import {
  addOfficeScheduleDays,
  bookingsInTimelineHour,
  buildOfficeScheduleTimelineHours,
  buildOfficeScheduleWeekStrip,
  computeOfficeScheduleCleanerStats,
  countOfficeScheduleStartingSoonUnassigned,
  filterOfficeScheduleBookings,
  resolveOfficeScheduleSummary,
  type OfficeScheduleDayBooking,
} from "@/lib/admin/officeScheduleDayPresentation";

function scheduleBooking(
  partial: Partial<OfficeScheduleDayBooking> & Pick<OfficeScheduleDayBooking, "id" | "status" | "time" | "date">,
): OfficeScheduleDayBooking {
  return {
    cleaner_id: null,
    selected_cleaner_id: null,
    customer_name: null,
    service: null,
    location: null,
    dispatch_status: null,
    ...partial,
  };
}

describe("resolveOfficeScheduleSummary", () => {
  it("uses API summary when provided", () => {
    expect(
      resolveOfficeScheduleSummary([], { total: 3, completed: 1, inProgress: 0, upcoming: 2, unassigned: 0 }),
    ).toEqual({ total: 3, completed: 1, inProgress: 0, upcoming: 2, unassigned: 0 });
  });
});

describe("buildOfficeScheduleTimelineHours", () => {
  it("builds hour range from booking times", () => {
    const hours = buildOfficeScheduleTimelineHours([
      scheduleBooking({ id: "1", status: "assigned", cleaner_id: "c1", time: "09:30:00", date: "2026-06-19" }),
      scheduleBooking({ id: "2", status: "assigned", cleaner_id: "c2", time: "14:00:00", date: "2026-06-19" }),
    ]);
    expect(hours).toContain("09:00");
    expect(hours).toContain("14:00");
    expect(
      bookingsInTimelineHour(
        [scheduleBooking({ id: "1", status: "assigned", cleaner_id: "c1", time: "09:30:00", date: "2026-06-19" })],
        "09:00",
      ),
    ).toHaveLength(1);
  });
});

describe("countOfficeScheduleStartingSoonUnassigned", () => {
  it("counts only today's unassigned jobs starting within 2 hours", () => {
    const now = new Date("2026-06-19T08:00:00+02:00");
    const count = countOfficeScheduleStartingSoonUnassigned(
      [
        scheduleBooking({
          id: "1",
          status: "pending",
          cleaner_id: null,
          selected_cleaner_id: null,
          time: "09:00:00",
          date: "2026-06-19",
        }),
        scheduleBooking({ id: "2", status: "assigned", cleaner_id: "c1", time: "09:30:00", date: "2026-06-19" }),
      ],
      "2026-06-19",
      now,
    );
    expect(count).toBe(1);
  });
});

describe("computeOfficeScheduleCleanerStats", () => {
  it("derives availability buckets from cleaners and bookings", () => {
    const stats = computeOfficeScheduleCleanerStats({
      dateYmd: "2026-06-19",
      cleaners: [
        { id: "c1", full_name: "A", is_available: true, status: "online" },
        { id: "c2", full_name: "B", is_available: true, status: "online" },
      ],
      bookings: [
        scheduleBooking({ id: "b1", status: "in_progress", cleaner_id: "c2", time: "10:00", date: "2026-06-19" }),
      ],
    });
    expect(stats.total).toBe(2);
    expect(stats.busy).toBeGreaterThanOrEqual(1);
  });

  it("splits off-today roster gates from manual offline/paused", () => {
    const stats = computeOfficeScheduleCleanerStats({
      dateYmd: "2026-07-05",
      cleaners: [
        { id: "c1", full_name: "Online", is_available: true, status: "available", availability_weekdays: ["sun"] },
        {
          id: "c2",
          full_name: "Off roster",
          is_available: true,
          status: "available",
          availability_weekdays: ["mon"],
        },
        { id: "c3", full_name: "Paused", is_available: false, status: "offline", availability_weekdays: ["sun"] },
        { id: "c4", full_name: "Offline", is_available: false, status: "offline", availability_weekdays: ["sun"] },
      ],
      bookings: [],
    });
    expect(stats.offToday).toBe(1);
    expect(stats.manuallyUnavailable).toBe(2);
    expect(stats.notReceiving).toBe(3);
    expect(stats.availableIdle).toBe(1);
  });
});

describe("addOfficeScheduleDays", () => {
  it("shifts YMD in Johannesburg calendar", () => {
    expect(addOfficeScheduleDays("2026-06-19", 1)).toBe("2026-06-20");
  });
});

describe("buildOfficeScheduleWeekStrip", () => {
  it("returns seven days starting Monday", () => {
    const strip = buildOfficeScheduleWeekStrip("2026-06-19");
    expect(strip).toHaveLength(7);
    expect(strip.some((d) => d.ymd === "2026-06-19")).toBe(true);
  });
});

describe("filterOfficeScheduleBookings", () => {
  it("filters unassigned bookings", () => {
    const rows = filterOfficeScheduleBookings(
      [
        scheduleBooking({
          id: "1",
          status: "pending",
          cleaner_id: null,
          selected_cleaner_id: null,
          time: "09:00",
          date: "2026-06-19",
        }),
        scheduleBooking({ id: "2", status: "assigned", cleaner_id: "c1", time: "10:00", date: "2026-06-19" }),
      ],
      "needs_action",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("1");
  });
});
