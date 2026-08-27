import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const service = read("apps/web/lib/workforce/cleanerPerformanceScorecards.ts");
const route = read("apps/web/app/api/admin/cleaner-performance/route.ts");
const page = read("apps/web/app/(ui-redesign)/office/cleaner-performance/page.tsx");
const adminPolicy = read("apps/web/lib/admin/requireAdmin.ts");

describe("P6 Cleaner Performance Scorecard contract", () => {
  it("uses canonical roster and quality/customer evidence", () => {
    expect(service).toContain('.from("booking_cleaners")');
    expect(service).toContain('.from("quality_inspections")');
    expect(service).toContain('.from("reviews")');
    expect(service).toContain('.from("customer_care_cases")');
  });

  it("does not read or mutate earnings and payout ledgers", () => {
    expect(service).not.toContain('cleaner_earnings');
    expect(service).not.toContain('payout_run');
    expect(service).not.toContain('booking_roster_member_payouts');
    expect(route).not.toContain('cleaner_earnings');
    expect(page).toContain("Earnings and payouts are not part of this score");
  });

  it("requires centralized cleaner performance read access and preserves missing evidence", () => {
    expect(route).toContain("requireAdminApi(request)");
    expect(route).not.toContain("admin_has_permission");
    expect(adminPolicy).toContain('if (path.includes("/cleaner-performance"))');
    expect(adminPolicy).toContain('return read ? ["cleaner.view", "team.view"] : ["cleaner.edit"]');
    expect(service).toContain("if (!availableWeight)");
    expect(service).toContain("overall:null as number|null");
    expect(service).toContain("coverage:0");
    expect(service).toContain("typeof value");
    expect(service).toContain('!=="number"');
  });

  it("scores QA, feedback, reliability, completion and attendance separately", () => {
    expect(service).toContain("quality: 30");
    expect(service).toContain("customerFeedback: 25");
    expect(service).toContain("reliability: 20");
    expect(service).toContain("completion: 15");
    expect(service).toContain("attendance: 10");
    expect(page).toContain("QA");
    expect(page).toContain("Reviews");
    expect(page).toContain("Reliability");
    expect(page).toContain("Completion");
    expect(page).toContain("Attendance");
  });

  it("limits complaint penalties to quality-related cases", () => {
    expect(service).toContain("QUALITY_CASE_CATEGORIES");
    expect(service).toContain("Math.min(20");
    expect(service).not.toContain('\"refund\",');
  });
});
