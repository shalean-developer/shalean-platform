import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("AUDIT-03A02-04 viewer payout read-model convergence", () => {
  it("hydrates both formal team and paired-roster payout rails in the shared helper", () => {
    const source = read("lib/cleaner/fetchViewerPayoutByBookingIds.ts");
    expect(source).toContain('from("team_job_member_payouts")');
    expect(source).toContain('from("booking_roster_member_payouts")');
    expect(source).toContain("bonus_cents");
    expect(source.indexOf("for (const raw of team.data")).toBeLessThan(
      source.indexOf("for (const raw of roster.data"),
    );
  });

  it("uses the shared canonical member payout override in all cleaner earnings surfaces", () => {
    for (const path of [
      "app/api/cleaner/earnings/route.ts",
      "app/api/cleaner/completed-jobs-month/route.ts",
      "app/api/cleaner/jobs/[id]/route.ts",
      "lib/cleaner/applyPreviewEarningsToCleanerJobRows.ts",
      "app/api/cleaner/dashboard/route.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("fetchViewerPayoutByBookingIds");
    }
  });

  it("job detail prefers canonical member payout over stale summary earnings", () => {
    const source = read("app/api/cleaner/jobs/[id]/route.ts");
    expect(source).toContain("viewerPayoutCents ?? cleanerFacing?.job_earning_cents ?? displayEarningsCents");
  });

  it("completed-jobs month honors payout attribution removal before member payout hydration", () => {
    const source = read("app/api/cleaner/completed-jobs-month/route.ts");
    expect(source).toContain("earnings_summary, metadata");
    expect(source).toContain("bookingHasActivePayoutAttributionRemoval(record)");
    expect(source.indexOf("bookingHasActivePayoutAttributionRemoval(record)")).toBeLessThan(
      source.indexOf("fetchViewerPayoutByBookingIds(admin"),
    );
    expect(source).toContain("viewer_payout_cents: viewerPayoutByBooking.get(bookingId) ?? null");
  });

  it("jobs feed hydrates paired-roster payouts through the shared preview helper, including lite mode", () => {
    const helper = read("lib/cleaner/applyPreviewEarningsToCleanerJobRows.ts");
    const jobs = read("app/api/cleaner/jobs/route.ts");
    expect(helper).toContain("fetchViewerPayoutByBookingIds");
    expect(helper).not.toContain('from("team_job_member_payouts")');
    expect(jobs).toContain("const liteOut = await applyPreviewEarningsToCleanerJobRows");
    expect(jobs).toContain("maxPreviews: 0");
  });

  it("dashboard summary totals use canonical viewer payouts and suppress removed attribution", () => {
    const source = read("app/api/cleaner/dashboard/route.ts");
    expect(source).toContain("fetchViewerPayoutByBookingIds");
    expect(source).toContain("bookingHasActivePayoutAttributionRemoval(row)");
    expect(source).toContain("viewer_payout_cents: viewerPayoutByBooking.get(bookingId) ?? null");
    expect(source).toContain("summaryRows");
  });

});
