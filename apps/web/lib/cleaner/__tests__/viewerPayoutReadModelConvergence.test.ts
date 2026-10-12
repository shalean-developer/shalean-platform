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
    ]) {
      const source = read(path);
      expect(source).toContain("fetchViewerPayoutByBookingIds");
    }
  });

  it("job detail prefers canonical member payout over stale summary earnings", () => {
    const source = read("app/api/cleaner/jobs/[id]/route.ts");
    expect(source).toContain("viewerPayoutCents ?? cleanerFacing?.job_earning_cents ?? displayEarningsCents");
  });

  it("completed-jobs month injects viewer_payout_cents before resolving earnings", () => {
    const source = read("app/api/cleaner/completed-jobs-month/route.ts");
    expect(source).toContain("viewer_payout_cents: viewerPayoutByBooking.get(bookingId) ?? null");
  });
});
