import { describe, expect, it } from "vitest";
import { countActiveTeamMembersOnDate, isTeamMemberActiveOnBookingDate } from "@/lib/cleaner/teamMemberAvailability";

describe("teamMemberAvailability", () => {
  it("counts only members with cleaner_id active on date", () => {
    const date = "2026-04-25";
    const members = [
      { cleaner_id: "a", active_from: null, active_to: null },
      { cleaner_id: "b", active_from: null, active_to: null },
      { cleaner_id: null, active_from: null, active_to: null },
    ];
    expect(countActiveTeamMembersOnDate(members, date)).toBe(2);
  });

  it("excludes membership that ends before booking day", () => {
    const date = "2026-04-25";
    const members = [{ cleaner_id: "a", active_from: null, active_to: "2026-04-24T12:00:00.000Z" }];
    expect(countActiveTeamMembersOnDate(members, date)).toBe(0);
  });

  it("isTeamMemberActiveOnBookingDate respects window", () => {
    expect(
      isTeamMemberActiveOnBookingDate(
        { active_from: "2026-04-26T00:00:00.000Z", active_to: null },
        "2026-04-25",
      ),
    ).toBe(false);
  });
});
