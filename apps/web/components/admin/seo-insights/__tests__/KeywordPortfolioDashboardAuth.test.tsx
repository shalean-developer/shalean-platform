import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("KeywordPortfolioDashboard admin auth", () => {
  it("uses authenticated admin helpers for reads and writes", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/admin/seo-insights/KeywordPortfolioDashboard.tsx"),
      "utf8",
    );
    expect(source).toContain('import { adminFetch, useAdminData } from "@/hooks/useAdminData"');
    expect(source).toContain('useAdminData<Payload>("/api/admin/seo-insights/keywords")');
    expect(source).toContain('adminFetch("/api/admin/seo-insights/keywords",{method:"POST"');
    expect(source).toContain('adminFetch("/api/admin/seo-insights/keywords",{method:"PATCH"');
    expect(source).not.toContain('fetch("/api/admin/seo-insights/keywords"');
  });
});
