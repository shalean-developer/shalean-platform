import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canReceiveOfficeWorkItem, type OfficeWorkItem } from "@/lib/admin/officeWorkItems";

const webRoot = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(webRoot, path), "utf8");

const applicationItem: OfficeWorkItem = {
  id: "workforce.application:1",
  type: "workforce.application",
  title: "Cleaner application needs review",
  summary: "Cape Town",
  priority: "high",
  status: "overdue",
  href: "/office/cleaner-applications?application=1",
  actionLabel: "Review application",
  requiredPermission: "application.decide",
  occurredAt: "2026-08-01T10:00:00Z",
  dueAt: "2026-08-03T10:00:00Z",
  branchId: null,
  teamId: null,
};

describe("Admin RBAC Priority 4 Workforce My Work queue", () => {
  it("requires application.decide and a safe cleaner-applications destination", () => {
    expect(canReceiveOfficeWorkItem(applicationItem, new Set(["application.decide"]))).toBe(true);
    expect(canReceiveOfficeWorkItem(applicationItem, new Set(["cleaner.view"]))).toBe(false);
    expect(canReceiveOfficeWorkItem({ ...applicationItem, href: "/office/cleaners" }, new Set(["application.decide"]))).toBe(false);
  });

  it("loads only pending applications for Workforce decision work", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain('permissions.has("application.decide")');
    expect(source).toContain('.from("cleaner_applications")');
    expect(source).toContain('.eq("status", "pending")');
    expect(source).toContain('requiredPermission: "application.decide"');
    expect(source).toContain('/office/cleaner-applications?application=');
  });

  it("permission-gates the cleaner application list endpoint", () => {
    const source = read("app/api/admin/cleaner-applications/route.ts");
    expect(source).toContain("requireAnyAdminPermissionFromRequest");
    expect(source).toContain('["cleaner.view", "application.decide"]');
    expect(source).toContain('"Cache-Control": "private, no-store"');
  });

  it("does not remove the existing Finance My Work queues", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain('permissions.has("finance.full.view")');
    expect(source).toContain('permissions.has("payout.prepare")');
    expect(source).toContain('type: "finance.invoice_overdue"');
    expect(source).toContain('type: "finance.payout_prepare"');
  });
});
