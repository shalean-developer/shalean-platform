import { describe, expect, it } from "vitest";
import {
  buildViewerRosterContext,
  augmentCleanerJobsWithViewerRosterContext,
  fetchRosterLifecycleByBookingIds,
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


it("keeps paired completion context across a large open-job backlog", async () => {
  const rows = Array.from({ length: 1101 }, (_, i) => ({ id: `booking-${i}`, status: "in_progress", is_team_job: false }));
  const requests: string[][] = [];
  const admin = { from: () => {
    let ids: string[] = [];
    const query = {
      select: () => query,
      in: (_column: string, batch: string[]) => { ids = batch; requests.push(batch); return query; },
      order: () => query,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ error: null, data: ids.flatMap((booking_id) => [
        { booking_id, cleaner_id: nyasha, role: "lead", completed_at: null },
        { booking_id, cleaner_id: ethel, role: "member", completed_at: "2026-10-19T10:00:00Z" },
      ]) })),
    };
    return query;
  } };
  const result = await augmentCleanerJobsWithViewerRosterContext(admin as never, rows, ethel);
  expect(requests).toHaveLength(12);
  expect(requests.every((ids) => ids.length <= 100)).toBe(true);
  expect(result.every((row) => row.viewer_is_paired_roster_member === true && row.viewer_roster_completed_at)).toBe(true);
});


it("pages roster rows when a bounded booking batch exceeds the response cap", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => Array.from({ length: 15 }, (_, j) => ({
    booking_id: `booking-${i}`, cleaner_id: `cleaner-${j}`, role: j === 0 ? "lead" : "member", completed_at: null,
  }))).flat();
  const pages: number[] = [];
  const query = {
    select: () => query, in: () => query, order: () => query,
    range: async (start: number, end: number) => {
      pages.push(start);
      return { data: rows.slice(start, end + 1), error: null };
    },
  };
  const result = await fetchRosterLifecycleByBookingIds({ from: () => query } as never, Array.from({ length: 100 }, (_, i) => `booking-${i}`));
  expect(pages).toEqual([0, 500, 1000, 1500]);
  expect(result.size).toBe(100);
  expect(result.get("booking-99")).toHaveLength(15);
});
