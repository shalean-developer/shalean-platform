import { describe, expect, it } from "vitest";
import { prioritizeCleanerJobsForList } from "@/lib/cleaner/prioritizeCleanerJobsForList";

describe("prioritizeCleanerJobsForList", () => {
  it("keeps every open job when completed history exceeds the payload cap", () => {
    const open = Array.from({ length: 22 }, (_, i) => ({
      id: `open-${i}`,
      status: i === 0 ? "in_progress" : "assigned",
      date: `2026-10-${String((i % 20) + 4).padStart(2, "0")}`,
      time: "09:00",
    }));
    const completed = Array.from({ length: 106 }, (_, i) => ({
      id: `done-${i}`,
      status: "completed",
      date: "2026-09-01",
      completed_at: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
    }));

    const result = prioritizeCleanerJobsForList([...completed, ...open], 100);
    const ids = new Set(result.map((row) => String(row.id)));

    expect(result).toHaveLength(100);
    for (const row of open) expect(ids.has(row.id)).toBe(true);
    expect(result[0]?.id).toBe("open-0");
    expect(result.filter((row) => String(row.status) === "completed")).toHaveLength(78);
  });

  it("returns all open rows even when open work alone exceeds the historical cap", () => {
    const rows = Array.from({ length: 105 }, (_, i) => ({
      id: `open-${i}`,
      status: "assigned",
      date: "2026-10-04",
      time: "09:00",
    }));

    expect(prioritizeCleanerJobsForList(rows, 100)).toHaveLength(105);
  });

  it("treats completed_at as authoritative history even when status drift is nonterminal", () => {
    const result = prioritizeCleanerJobsForList(
      [
        { id: "real-open", status: "assigned", date: "2026-10-04", time: "08:00", completed_at: null },
        { id: "drifted", status: "assigned", date: "2026-10-03", time: "08:00", completed_at: "2026-10-03T12:00:00Z" },
      ],
      1,
    );

    expect(result.map((row) => row.id)).toEqual(["real-open"]);
  });

  it("keeps newest history first after open rows", () => {
    const result = prioritizeCleanerJobsForList(
      [
        { id: "old", status: "completed", date: "2026-09-01", completed_at: "2026-09-01T12:00:00Z" },
        { id: "open", status: "assigned", date: "2026-10-04", time: "08:00" },
        { id: "new", status: "completed", date: "2026-10-02", completed_at: "2026-10-02T12:00:00Z" },
      ],
      2,
    );

    expect(result.map((row) => row.id)).toEqual(["open", "new"]);
  });
});
