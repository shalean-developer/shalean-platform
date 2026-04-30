import { describe, expect, it } from "vitest";
import { allocateTeamMemberPayoutCentsFromRoster, allocateTeamMemberPayoutCentsEqualSplit } from "@/lib/payout/teamRosterPayoutAllocation";

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("allocateTeamMemberPayoutCentsFromRoster", () => {
  it("splits pool by weights and assigns remainder + bonus to lead", () => {
    const m = allocateTeamMemberPayoutCentsFromRoster(10_000, [
      { cleaner_id: ID_A, role: "lead", payout_weight: 2, lead_bonus_cents: 500 },
      { cleaner_id: ID_B, role: "member", payout_weight: 1, lead_bonus_cents: 0 },
    ]);
    expect([...m.values()].reduce((x, y) => x + y, 0)).toBe(10_000);
    expect(m.get(ID_A)! + m.get(ID_B)!).toBe(10_000);
    expect(m.get(ID_A)!).toBeGreaterThan(m.get(ID_B)!);
  });

  it("handles zero pool", () => {
    const m = allocateTeamMemberPayoutCentsFromRoster(0, [
      { cleaner_id: ID_A, role: "lead", payout_weight: 1, lead_bonus_cents: 0 },
    ]);
    expect(m.get(ID_A)).toBe(0);
  });
});

describe("allocateTeamMemberPayoutCentsEqualSplit", () => {
  it("distributes remainder", () => {
    const m = allocateTeamMemberPayoutCentsEqualSplit(100, [ID_A, ID_B, ID_C]);
    expect([...m.values()].reduce((x, y) => x + y, 0)).toBe(100);
  });
});
