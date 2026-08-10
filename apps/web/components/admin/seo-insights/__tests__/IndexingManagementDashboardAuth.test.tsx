import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("IndexingManagementDashboard admin auth", () => {
  it("uses adminFetch for the manual indexing mutation", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/admin/seo-insights/IndexingManagementDashboard.tsx"),
      "utf8",
    );
    expect(source).toContain('import { adminFetch, useAdminData } from "@/hooks/useAdminData"');
    expect(source).toContain('adminFetch("/api/admin/seo-insights/indexing",{method:"POST"})');
    expect(source).not.toContain('fetch("/api/admin/seo-insights/indexing",{method:"POST"})');
  });
});
