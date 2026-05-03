import { describe, expect, it } from "vitest";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { prioritizeDashboardJobsForDisplay } from "@/lib/cleaner-dashboard/prioritizeDashboardJobs";

function row(p: Partial<CleanerBookingRow> & { id: string }): CleanerBookingRow {
  return {
    service: "Std",
    date: null,
    time: null,
    location: null,
    status: "assigned",
    total_paid_zar: null,
    customer_name: null,
    customer_phone: null,
    assigned_at: null,
    en_route_at: null,
    started_at: null,
    completed_at: null,
    created_at: null,
    ...p,
  };
}

describe("prioritizeDashboardJobsForDisplay", () => {
  it("keeps earliest future open job when slice would otherwise drop it", () => {
    const todayY = "2026-05-03";
    const todayRows = Array.from({ length: 12 }, (_, i) =>
      row({
        id: `today-${i}`,
        date: todayY,
        time: `${String(8 + i).padStart(2, "0")}:00`,
        status: "assigned",
      }),
    );
    const future = row({
      id: "future-1",
      date: "2026-05-04",
      time: "08:30",
      status: "assigned",
    });
    const merged = prioritizeDashboardJobsForDisplay([...todayRows, future], new Date("2026-05-03T12:00:00Z"), 12, todayY);
    expect(merged.some((r) => r.id === "future-1")).toBe(true);
    expect(merged).toHaveLength(12);
  });
});
