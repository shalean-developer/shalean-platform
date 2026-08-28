import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd());
const summaryHook = fs.readFileSync(path.join(repoRoot, "hooks/useDashboardSummary.ts"), "utf8");
const summaryRoute = fs.readFileSync(path.join(repoRoot, "app/api/dashboard/summary/route.ts"), "utf8");

describe("SR-07C account summary ownership convergence", () => {
  it("claims legacy booking ownership before loading the account summary", () => {
    const claim = summaryHook.indexOf('dashboardFetchJson<{ ok?: boolean; claimed?: number }>("/api/customer/bookings"');
    const summary = summaryHook.indexOf('dashboardFetchJson<DashboardSummaryPayload>("/api/dashboard/summary"');

    expect(claim).toBeGreaterThanOrEqual(0);
    expect(summary).toBeGreaterThan(claim);
    expect(summaryHook).toContain('method: "POST"');
  });

  it("keeps the summary server read-only and scoped to the authenticated customer", () => {
    expect(summaryRoute).toContain("loadCustomerBookingRowsForUser(admin, userId, { viewerEmail })");
    expect(summaryRoute).toContain('.eq("customer_id", userId)');
    expect(summaryRoute).not.toContain("claimCustomerBookingOwnership");
  });
});
