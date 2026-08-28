import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cleanerManagementStatus } from "@/lib/admin/cleanerManagementStatus";

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("SR-06A Cleaner Management source of truth", () => {
  it("requires cleaner.view before reading cleaner detail data", () => {
    const route = source("../../../app/api/admin/cleaners/[id]/route.ts");
    const getStart = route.indexOf("export async function GET");
    const patchStart = route.indexOf("export async function PATCH");
    const getBody = route.slice(getStart, patchStart);

    expect(getBody).toContain('requireAdminApi(request, ["cleaner.view"])');
    expect(getBody.indexOf('requireAdminApi(request, ["cleaner.view"])')).toBeLessThan(
      getBody.indexOf("getSupabaseAdmin()"),
    );
  });

  it("requires cleaner.edit before mutating cleaner detail data", () => {
    const route = source("../../../app/api/admin/cleaners/[id]/route.ts");
    const patchBody = route.slice(route.indexOf("export async function PATCH"));

    expect(patchBody).toContain('requireAdminApi(request, ["cleaner.edit"])');
    expect(patchBody.indexOf('requireAdminApi(request, ["cleaner.edit"])')).toBeLessThan(
      patchBody.indexOf("getSupabaseAdmin()"),
    );
    expect(route).not.toContain("requireAdminFromRequest");
    expect(route).not.toContain("requireAdminUser");
  });

  it("projects lifecycle and dispatch truth into one three-state Office status", () => {
    expect(cleanerManagementStatus({ status: "available", is_available: true, is_active: true })).toBe("available");
    expect(cleanerManagementStatus({ status: "busy", is_available: true, is_active: true })).toBe("busy");
    expect(cleanerManagementStatus({ status: "busy", is_available: false, is_active: true })).toBe("offline");
    expect(cleanerManagementStatus({ status: "available", is_available: true, is_active: false })).toBe("offline");
    expect(cleanerManagementStatus({ status: "sick", is_available: true, is_active: true })).toBe("offline");
    expect(cleanerManagementStatus({ status: null, is_available: true, is_active: true })).toBe("offline");
  });

  it("uses the canonical projection in the roster loader", () => {
    const loader = source("../loadAdminCleanersList.ts");
    expect(loader).toContain('import { cleanerManagementStatus } from "@/lib/admin/cleanerManagementStatus"');
    expect(loader).toContain("rows.map(projectOfficeStatus)");
    expect(loader).toContain('.eq("is_available", true).neq("is_active", false)');
  });

  it("does not present the cleaner lifecycle flag as same-day activity", () => {
    const metricsGrid = source("../../../components/admin/MetricsGrid.tsx");
    expect(metricsGrid).toContain('item.label === "Active today" ? { ...item, label: "Active cleaners" } : item');
    expect(metricsGrid).toContain('item.label === "Total cleaners"');
    expect(metricsGrid).toContain('item.label === "Available now"');
  });
});
