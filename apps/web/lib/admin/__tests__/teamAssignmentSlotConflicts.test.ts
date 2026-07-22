import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findTeamJobSlotConflict,
  formatTeamAssignmentSlotConflictError,
} from "@/lib/admin/teamAssignmentSlotConflicts";

describe("formatTeamAssignmentSlotConflictError", () => {
  it("describes a team slot conflict in plain language", () => {
    expect(
      formatTeamAssignmentSlotConflictError({
        kind: "team",
        dateYmd: "2026-07-13",
        timeHm: "09:00",
        conflict: { id: "x", customer_name: "Joan Van Der Wal Family  Trust", time: "09:00" },
      }),
    ).toContain("already assigned at 2026-07-13 09:00");
  });
});

describe("findTeamJobSlotConflict", () => {
  const maybeSingle = vi.fn();
  const neq = vi.fn(() => ({ maybeSingle }));
  const inStatus = vi.fn(() => ({ neq }));
  const eqIsTeam = vi.fn(() => ({ in: inStatus }));
  const inTime = vi.fn(() => ({ eq: eqIsTeam }));
  const eqDate = vi.fn(() => ({ in: inTime }));
  const eqTeam = vi.fn(() => ({ eq: eqDate }));
  const select = vi.fn(() => ({ eq: eqTeam }));
  const from = vi.fn(() => ({ select }));
  const admin = { from } as never;

  beforeEach(() => {
    maybeSingle.mockReset();
    inTime.mockClear();
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("matches both HH:MM and legacy HH:MM:SS booking times", async () => {
    await findTeamJobSlotConflict(admin, {
      teamId: "22222222-2222-4222-8222-222222222222",
      dateYmd: "2026-07-13",
      timeHm: "09:00:00",
      excludeBookingId: "11111111-1111-4111-8111-111111111111",
    });
    expect(inTime).toHaveBeenCalledWith("time", ["09:00", "09:00:00"]);
  });
});
