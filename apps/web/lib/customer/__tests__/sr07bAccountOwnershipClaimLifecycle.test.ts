import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), "utf8");

const hook = read("apps/web/hooks/useBookings.ts");
const modify = read("apps/web/lib/customer/customerBookingModifyHandlers.ts");

describe("SR-07B customer account ownership claim lifecycle", () => {
  it("claims legacy orphan ownership before canonical list and detail reads", () => {
    expect(hook).toContain('method: "POST"');
    expect(hook).toContain('"/api/customer/bookings"');
    expect(hook).toContain("ownershipClaimedForUserRef");
    expect(hook).toContain("detailOwnershipClaimedForUserRef");
    expect(hook.indexOf("claimCustomerBookingOwnershipForAccount(userId")).toBeLessThan(
      hook.indexOf('dashboardFetchJson<{ bookings?: BookingRow[] }>("/api/customer/bookings")'),
    );
    expect(hook.indexOf("claimCustomerBookingOwnershipForAccount(detailUserId")).toBeLessThan(
      hook.indexOf("dashboardFetchJson<{ booking?: BookingRow }>(`/api/customer/bookings/${encodeURIComponent(id)}`)"),
    );
  });

  it("keeps cancel and reschedule writes constrained to canonical ownership", () => {
    expect(modify).toContain('.eq(ownershipColumn, auth.userId)');
    expect(modify.match(/\.eq\(ownershipColumn, auth\.userId\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
