import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("StructuredDataDashboard admin auth", () => {
  it("uses authenticated admin helpers for reads and manual audits", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/admin/seo-insights/StructuredDataDashboard.tsx"),
      "utf8",
    );
    expect(source).toContain('import { adminFetch, useAdminData } from "@/hooks/useAdminData"');
    expect(source).toContain('useAdminData<Payload>("/api/admin/seo-insights/structured-data")');
    expect(source).toContain('adminFetch("/api/admin/seo-insights/structured-data"');
    expect(source).not.toContain('fetch("/api/admin/seo-insights/structured-data"');
  });
});
