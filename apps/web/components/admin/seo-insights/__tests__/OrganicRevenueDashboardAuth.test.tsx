import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("OrganicRevenueDashboard admin auth", () => {
  it("uses authenticated admin data helper", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/admin/seo-insights/OrganicRevenueDashboard.tsx"),
      "utf8",
    );
    expect(source).toContain('import { useAdminData } from "@/hooks/useAdminData"');
    expect(source).toContain('useAdminData<Payload>("/api/admin/seo-insights/organic-revenue")');
    expect(source).not.toContain('fetch("/api/admin/seo-insights/organic-revenue"');
  });
});
