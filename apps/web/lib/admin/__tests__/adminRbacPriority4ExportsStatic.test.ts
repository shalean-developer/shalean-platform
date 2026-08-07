import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(process.cwd());
function read(path: string): string {
  return readFileSync(resolve(webRoot, path), "utf8");
}

describe("Admin RBAC Priority 4 governed exports", () => {
  it("booking exports require export permission, preserve scoped reads and enforce bulk approval", () => {
    const source = read("app/api/admin/bookings/export/route.ts");
    expect(source).toContain('requireAdminPermissionFromRequest(request, "booking.export")');
    expect(source).toContain('url.pathname = "/api/admin/bookings/scoped"');
    expect(source).toContain('adminUserHasPermission(auth.user.id, "bulk_export.approve")');
    expect(source).toContain('event_type: "admin_export_completed"');
    expect(source).toContain("revenue_included: canViewRevenue");
  });

  it("customer exports require customer.export and omit finance fields without finance permission", () => {
    const source = read("app/api/admin/customers/export/route.ts");
    expect(source).toContain('requireAdminPermissionFromRequest(request, "customer.export")');
    expect(source).toContain('url.pathname = "/api/admin/customers/scoped"');
    expect(source).toContain('adminUserHasPermission(auth.user.id, "bulk_export.approve")');
    expect(source).toContain('canSeeFinance ? ["total_spend_zar"] : []');
    expect(source).toContain('event_type: "admin_export_completed"');
  });

  it("bookings UI export helper no longer reads scoped booking pages directly", () => {
    const source = read("lib/admin/officeBookingsListExport.ts");
    expect(source).toContain("/api/admin/bookings/export?");
    expect(source).not.toContain("/api/admin/bookings/scoped?");
  });
});
