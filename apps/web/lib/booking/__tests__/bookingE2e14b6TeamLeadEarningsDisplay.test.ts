import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-14B.6 team lead earnings display", () => {
  it("exposes canonical earnings summary on cleaner jobs", () => {
    const src = read("app/api/cleaner/jobs/route.ts");
    expect(src).toContain("earnings_summary");
  });

  it("preserves canonical earnings summary on cleaner dashboard wire", () => {
    const src = read("app/api/cleaner/dashboard/route.ts");
    expect(src).toContain("earnings_summary: raw.earnings_summary");
  });

  it("batches viewer-specific team member payouts before card normalization", () => {
    const src = read("lib/cleaner/applyPreviewEarningsToCleanerJobRows.ts");
    expect(src).toContain('from("team_job_member_payouts")');
    expect(src).toContain('.eq("cleaner_id", cleanerId)');
    expect(src).toContain("viewer_payout_cents");
    expect(src).toContain("resolveCleanerDashboardEarningsCents");
  });

  it("keeps team per-cleaner summary ahead of generic display while solo retains lock precedence", () => {
    const src = read("lib/cleaner/resolveCleanerEarnings.ts");
    expect(src).toContain("booking.is_team_job === true && facing");
    expect(src.indexOf("booking.is_team_job === true && facing")).toBeLessThan(
      src.indexOf("const locked = resolveCleanerEarningsCents(booking)"),
    );
  });
});
