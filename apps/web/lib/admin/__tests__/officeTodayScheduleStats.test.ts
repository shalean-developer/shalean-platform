import { describe, expect, it } from "vitest";
import {
  bookingHasAssignment,
  bookingHasPreferredCleanerOnly,
  computeOfficeTodayScheduleStats,
  officeScheduleStatusPresentation,
} from "@/lib/admin/officeTodayScheduleStats";

describe("bookingHasAssignment", () => {
  it("requires confirmed cleaner_id, team_id, or roster — not preferred-only", () => {
    expect(bookingHasAssignment({ status: "pending", cleaner_id: "c1" })).toBe(true);
    expect(bookingHasAssignment({ status: "pending", cleaner_id: null, team_id: "t1" })).toBe(true);
    expect(
      bookingHasAssignment({
        status: "pending",
        cleaner_id: null,
        booking_cleaners: [{ cleaner_id: "c1", full_name: "A", role: "lead" }],
      }),
    ).toBe(true);
    expect(
      bookingHasAssignment({ status: "pending", cleaner_id: null, selected_cleaner_id: "c1" }),
    ).toBe(false);
    expect(bookingHasPreferredCleanerOnly({ status: "pending", cleaner_id: null, selected_cleaner_id: "c1" })).toBe(
      true,
    );
  });
});

describe("computeOfficeTodayScheduleStats", () => {
  it("excludes cancelled from operational total and buckets segments to 100%", () => {
    const stats = computeOfficeTodayScheduleStats([
      { status: "completed", cleaner_id: "c1" },
      { status: "completed", cleaner_id: "c2" },
      { status: "in_progress", cleaner_id: "c3" },
      { status: "assigned", cleaner_id: "c4" },
      { status: "pending", cleaner_id: null },
      { status: "cancelled", cleaner_id: null },
      { status: "payment_expired", cleaner_id: null },
    ]);

    expect(stats).toEqual({
      total: 5,
      rawTotal: 7,
      completed: 2,
      inProgress: 1,
      upcoming: 1,
      unassigned: 1,
      cancelled: 2,
    });
    expect(stats.completed + stats.inProgress + stats.upcoming + stats.unassigned).toBe(stats.total);
  });

  it("counts preferred-only rows as unassigned", () => {
    const stats = computeOfficeTodayScheduleStats([
      { status: "pending", cleaner_id: null, selected_cleaner_id: "pref-1" },
    ]);
    expect(stats.unassigned).toBe(1);
    expect(stats.upcoming).toBe(0);
    expect(officeScheduleStatusPresentation({ status: "pending", cleaner_id: null, selected_cleaner_id: "pref-1" })).toEqual(
      { label: "Preferred", tone: "unassigned" },
    );
  });
});
