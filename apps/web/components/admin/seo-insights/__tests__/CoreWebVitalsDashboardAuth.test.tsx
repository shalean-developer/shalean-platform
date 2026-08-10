import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("CoreWebVitalsDashboard admin auth", () => {
  it("uses authenticated admin helpers for reads and manual measurements", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/admin/seo-insights/CoreWebVitalsDashboard.tsx"),
      "utf8",
    );
    expect(source).toContain('import { adminFetch, useAdminData } from "@/hooks/useAdminData"');
    expect(source).toContain('useAdminData<Payload>("/api/admin/seo-insights/web-vitals")');
    expect(source).toContain('adminFetch("/api/admin/seo-insights/web-vitals", { method:"POST" })');
    expect(source).not.toContain('fetch("/api/admin/seo-insights/web-vitals"');
  });
});
