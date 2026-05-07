import { describe, expect, it } from "vitest";
import {
  isDispatchTeamPoolServiceType,
  normalizeTeamServiceTypeFromDb,
  teamServiceTypeDatabaseValues,
} from "@/lib/dispatch/teamServiceTypeDb";

describe("teamServiceTypeDb", () => {
  it("normalizes canonical and legacy DB values", () => {
    expect(normalizeTeamServiceTypeFromDb("deep_cleaning")).toBe("deep_cleaning");
    expect(normalizeTeamServiceTypeFromDb("deep")).toBe("deep_cleaning");
    expect(normalizeTeamServiceTypeFromDb("Deep Cleaning")).toBe("deep_cleaning");
    expect(normalizeTeamServiceTypeFromDb("move_cleaning")).toBe("move_cleaning");
    expect(normalizeTeamServiceTypeFromDb("move")).toBe("move_cleaning");
    expect(normalizeTeamServiceTypeFromDb("Move cleaning")).toBe("move_cleaning");
    expect(normalizeTeamServiceTypeFromDb("Move-in/out")).toBe("move_cleaning");
    expect(normalizeTeamServiceTypeFromDb("standard")).toBe(null);
  });

  it("returns DB query aliases per logical service", () => {
    expect(teamServiceTypeDatabaseValues("deep_cleaning")).toEqual(["deep_cleaning", "deep"]);
    expect(teamServiceTypeDatabaseValues("move_cleaning")).toEqual(["move_cleaning", "move"]);
  });

  it("treats deep and move team rows as one dispatch pool", () => {
    expect(isDispatchTeamPoolServiceType("deep_cleaning")).toBe(true);
    expect(isDispatchTeamPoolServiceType("move_cleaning")).toBe(true);
    expect(isDispatchTeamPoolServiceType("standard")).toBe(false);
  });
});
