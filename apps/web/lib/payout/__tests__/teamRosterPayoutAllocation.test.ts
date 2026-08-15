import { describe, expect, it } from "vitest";
import {
  allocateTeamMemberPayoutCentsFromRoster,
  allocateTeamMemberPayoutCentsEqualSplit,
  resolveTeamPayoutParticipantIds,
} from "@/lib/payout/teamRosterPayoutAllocation";

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ID_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ID_E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ID_F = "ffffffff-ffff-4fff-8fff-ffffffffffff";

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

describe("resolveTeamPayoutParticipantIds", () => {
  it("prefers booking roster over team_members when roster rows exist", () => {
    expect(
      resolveTeamPayoutParticipantIds({
        rosterRows: [{ cleaner_id: ID_A }, { cleaner_id: ID_B }],
        activeTeamMemberIds: [ID_C],
      }),
    ).toEqual([ID_A, ID_B]);
  });

  it("does not pay the full permanent team when only three cleaners worked the booking", () => {
    expect(
      resolveTeamPayoutParticipantIds({
        rosterRows: [
          { cleaner_id: ID_A },
          { cleaner_id: ID_B },
          { cleaner_id: ID_C },
        ],
        activeTeamMemberIds: [ID_A, ID_B, ID_C, ID_D, ID_E, ID_F],
      }),
    ).toEqual([ID_A, ID_B, ID_C]);
  });

  it("deduplicates booking roster participants", () => {
    expect(
      resolveTeamPayoutParticipantIds({
        rosterRows: [{ cleaner_id: ID_A }, { cleaner_id: ID_A }, { cleaner_id: ID_B }],
        activeTeamMemberIds: [ID_A, ID_B, ID_C],
      }),
    ).toEqual([ID_A, ID_B]);
  });

  it("falls back to active team members when roster is empty", () => {
    expect(
      resolveTeamPayoutParticipantIds({
        rosterRows: [],
        activeTeamMemberIds: [ID_B, ID_A, ID_B],
      }),
    ).toEqual([ID_B, ID_A]);
  });
});
