import { describe, expect, it } from "vitest";
import { resolveTeamPayoutOwnerCleanerId } from "@/lib/dispatch/resolveTeamPayoutOwnerCleanerId";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("resolveTeamPayoutOwnerCleanerId", () => {
  const passAll = () => true;
  const passOnly = (id: string) => id === B;

  it("uses appointed lead when active and qualified", () => {
    expect(
      resolveTeamPayoutOwnerCleanerId({
        teamLeadCleanerId: B,
        activeCleanerIdsSorted: [A, B],
        cleanerPassesGate: passAll,
        allowFallback: false,
      }),
    ).toBe(B);
  });

  it("admin path returns null without appointed lead", () => {
    expect(
      resolveTeamPayoutOwnerCleanerId({
        teamLeadCleanerId: null,
        activeCleanerIdsSorted: [A, B],
        cleanerPassesGate: passAll,
        allowFallback: false,
      }),
    ).toBeNull();
  });

  it("dispatch path falls back to first qualified member", () => {
    expect(
      resolveTeamPayoutOwnerCleanerId({
        teamLeadCleanerId: null,
        activeCleanerIdsSorted: [A, B],
        cleanerPassesGate: passOnly,
        allowFallback: true,
      }),
    ).toBe(B);
  });

  it("ignores appointed lead when not capability-qualified", () => {
    expect(
      resolveTeamPayoutOwnerCleanerId({
        teamLeadCleanerId: A,
        activeCleanerIdsSorted: [A, B],
        cleanerPassesGate: passOnly,
        allowFallback: true,
      }),
    ).toBe(B);
  });

  it("ignores appointed lead not on active roster", () => {
    expect(
      resolveTeamPayoutOwnerCleanerId({
        teamLeadCleanerId: C,
        activeCleanerIdsSorted: [A, B],
        cleanerPassesGate: passAll,
        allowFallback: false,
      }),
    ).toBeNull();
  });
});
