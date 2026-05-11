import { describe, it, expect } from "vitest";
import type { CleanerUpcomingJob } from "@/components/cleaner-dashboard/types";
import { cleanerJobEarningFromCents } from "@/lib/cleaner/cleanerJobEarning";
import { selectActiveJob } from "@/lib/cleaner-dashboard/selectActiveJob";

function job(overrides: Partial<CleanerUpcomingJob>): CleanerUpcomingJob {
  return {
    id: "j",
    timeLine: "Today, 09:00 – 11:00",
    suburb: "Claremont",
    href: "/cleaner/jobs/j",
    phaseDisplay: "Assigned",
    jobEarning: cleanerJobEarningFromCents(40000),
    ...overrides,
  };
}

describe("selectActiveJob", () => {
  it("returns null when no job is active", () => {
    expect(selectActiveJob([])).toBeNull();
    expect(selectActiveJob([job({ phaseDisplay: "Assigned" }), job({ phaseDisplay: "Completed" })])).toBeNull();
  });

  it("picks an in-progress job over an en-route one", () => {
    const a = job({ id: "a", phaseDisplay: "En route" });
    const b = job({ id: "b", phaseDisplay: "In progress" });
    expect(selectActiveJob([a, b])?.id).toBe("b");
    expect(selectActiveJob([b, a])?.id).toBe("b");
  });

  it("treats 'On the way' and 'On my way' as en route", () => {
    const a = job({ id: "a", phaseDisplay: "On the way" });
    const b = job({ id: "b", phaseDisplay: "On my way" });
    expect(selectActiveJob([a])?.id).toBe("a");
    expect(selectActiveJob([b])?.id).toBe("b");
  });

  it("ignores Cancelled / Completed phases", () => {
    expect(
      selectActiveJob([
        job({ id: "x", phaseDisplay: "Cancelled" }),
        job({ id: "y", phaseDisplay: "Completed" }),
      ]),
    ).toBeNull();
  });

  it("matches phase strings case-insensitively and trims whitespace", () => {
    expect(selectActiveJob([job({ id: "z", phaseDisplay: "  IN PROGRESS  " })])?.id).toBe("z");
  });
});
