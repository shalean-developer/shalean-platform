import { describe, expect, it } from "vitest";
import {
  buildViewerRosterContext,
  pairedRosterMemberShouldShowComplete,
  viewerHasRosterVisitCompleted,
} from "@/lib/cleaner/pairedRosterMemberLifecycle";

const nyasha = "796e3ad7-07f3-44eb-b4cf-bed439a59f8b";
const ethel = "914b3acf-40e8-4ad5-a5a2-9e2de711849a";

const pairedRoster = [
  { cleaner_id: nyasha, role: "lead", completed_at: null },
  { cleaner_id: ethel, role: "member", completed_at: null },
];

describe("pairedRosterMemberLifecycle", () => {
  it("detects paired roster member context for Ethel", () => {
    const ctx = buildViewerRosterContext({
      booking: { is_team_job: false, cleaner_count: 2 },
      rosterRows: pairedRoster,
      viewerCleanerId: ethel,
    });
    expect(ctx.pairedRosterJob).toBe(true);
    expect(ctx.viewerIsPairedRosterMember).toBe(true);
    expect(ctx.viewerRosterRole).toBe("member");
  });

  it("lead is not a paired roster member cleaner", () => {
    const ctx = buildViewerRosterContext({
      booking: { is_team_job: false, cleaner_count: 2 },
      rosterRows: pairedRoster,
      viewerCleanerId: nyasha,
    });
    expect(ctx.pairedRosterJob).toBe(true);
    expect(ctx.viewerIsPairedRosterMember).toBe(false);
    expect(ctx.viewerRosterRole).toBe("lead");
  });

  it("member sees complete when booking is in_progress", () => {
    const ctx = buildViewerRosterContext({
      booking: { is_team_job: false, cleaner_count: 2 },
      rosterRows: pairedRoster,
      viewerCleanerId: ethel,
    });
    expect(
      pairedRosterMemberShouldShowComplete({ status: "in_progress", completed_at: null }, ctx),
    ).toBe(true);
  });

  it("member sees complete when booking completed but their roster row is open", () => {
    const ctx = buildViewerRosterContext({
      booking: { is_team_job: false, cleaner_count: 2 },
      rosterRows: pairedRoster,
      viewerCleanerId: ethel,
    });
    expect(
      pairedRosterMemberShouldShowComplete(
        { status: "completed", completed_at: "2026-07-07T10:30:00Z" },
        ctx,
      ),
    ).toBe(true);
  });

  it("member does not see complete after marking their visit done", () => {
    const ctx = buildViewerRosterContext({
      booking: { is_team_job: false, cleaner_count: 2 },
      rosterRows: [{ cleaner_id: ethel, role: "member", completed_at: "2026-07-07T11:00:00Z" }],
      viewerCleanerId: ethel,
    });
    expect(viewerHasRosterVisitCompleted(ctx)).toBe(true);
    expect(
      pairedRosterMemberShouldShowComplete({ status: "completed", completed_at: "2026-07-07T10:30:00Z" }, ctx),
    ).toBe(false);
  });

  it("member waits while booking is still assigned", () => {
    const ctx = buildViewerRosterContext({
      booking: { is_team_job: false, cleaner_count: 2 },
      rosterRows: pairedRoster,
      viewerCleanerId: ethel,
    });
    expect(pairedRosterMemberShouldShowComplete({ status: "assigned", completed_at: null }, ctx)).toBe(false);
  });
});
