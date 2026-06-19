import { describe, expect, it } from "vitest";
import {
  aggregateTeamJobsByTeamId,
  teamDayJobsForMetrics,
} from "@/lib/dispatch/teamJobsPerDay";

describe("aggregateTeamJobsByTeamId", () => {
  it("groups rows by team_id", () => {
    const map = aggregateTeamJobsByTeamId([
      { team_id: "a" },
      { team_id: "a" },
      { team_id: "b" },
      { team_id: null },
      { team_id: "  " },
    ]);
    expect(map.get("a")).toBe(2);
    expect(map.get("b")).toBe(1);
    expect(map.size).toBe(2);
  });
});

describe("teamDayJobsForMetrics", () => {
  it("uses the higher of scheduled jobs and usage slots", () => {
    const scheduled = new Map([["t1", 1], ["t2", 0]]);
    const usage = new Map([["t1", 0], ["t2", 1]]);
    expect(teamDayJobsForMetrics(scheduled, usage, "t1")).toBe(1);
    expect(teamDayJobsForMetrics(scheduled, usage, "t2")).toBe(1);
    expect(teamDayJobsForMetrics(scheduled, usage, "missing")).toBe(0);
  });
});
