import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

const webRoot = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(webRoot, path), "utf8");
const permissionsFor = (path: string, method = "GET") =>
  priorityPermissionsForRequest(new Request(`https://shalean.test${path}`, { method }));

describe("SR-05B2A centralized operational RBAC", () => {
  it("preserves Inventory and Transport read/write permission sets", () => {
    expect(permissionsFor("/api/admin/inventory")).toEqual([
      "expense.manage",
      "booking.assign",
      "finance.full.view",
    ]);
    expect(permissionsFor("/api/admin/inventory", "POST")).toEqual([
      "expense.manage",
      "booking.assign",
    ]);
    expect(permissionsFor("/api/admin/inventory/actions", "POST")).toEqual([
      "expense.manage",
      "booking.assign",
    ]);
    expect(permissionsFor("/api/admin/transport")).toEqual([
      "booking.assign",
      "booking.view",
      "expense.manage",
      "finance.full.view",
    ]);
    expect(permissionsFor("/api/admin/transport", "POST")).toEqual([
      "booking.assign",
      "expense.manage",
    ]);
  });

  it("preserves Quality read access and keeps writes on incident.manage", () => {
    expect(permissionsFor("/api/admin/quality/inspections")).toEqual([
      "incident.manage",
      "booking.view",
      "cleaner.view",
    ]);
    expect(permissionsFor("/api/admin/quality/inspections/inspection-1")).toEqual([
      "incident.manage",
      "booking.view",
      "cleaner.view",
    ]);
    expect(permissionsFor("/api/admin/quality/inspections", "POST")).toEqual([
      "incident.manage",
    ]);
    expect(permissionsFor("/api/admin/quality/inspections/inspection-1", "PATCH")).toEqual([
      "incident.manage",
    ]);
  });

  it("aligns Cleaner Performance API reads with the approved Office page policy", () => {
    expect(permissionsFor("/api/admin/cleaner-performance")).toEqual([
      "cleaner.view",
      "team.view",
    ]);
  });

  it("uses only the shared API gate for global permission checks while retaining supervisor scope checks", () => {
    for (const path of [
      "app/api/admin/inventory/route.ts",
      "app/api/admin/inventory/actions/route.ts",
      "app/api/admin/transport/route.ts",
      "app/api/admin/quality/inspections/route.ts",
      "app/api/admin/quality/inspections/[id]/route.ts",
      "app/api/admin/cleaner-performance/route.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("requireAdminApi(request)");
      expect(source).not.toContain("admin_has_permission");
    }

    const qualityList = read("app/api/admin/quality/inspections/route.ts");
    const qualityDetail = read("app/api/admin/quality/inspections/[id]/route.ts");
    const performance = read("app/api/admin/cleaner-performance/route.ts");
    expect(qualityList).toContain("resolveSupervisorTeamScope");
    expect(qualityList).toContain("bookingBelongsToSupervisorScope");
    expect(qualityDetail).toContain("resolveSupervisorTeamScope");
    expect(qualityDetail).toContain("bookingBelongsToSupervisorScope");
    expect(performance).toContain("resolveSupervisorTeamScope");
  });
});
