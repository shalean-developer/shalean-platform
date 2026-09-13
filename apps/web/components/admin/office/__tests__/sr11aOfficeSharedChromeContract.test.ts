import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const analyticsSource = fs.readFileSync(
  path.resolve(process.cwd(), "app/(ui-redesign)/office/analytics/page.tsx"),
  "utf8",
);

describe("SR-11A Office shared chrome contract", () => {
  it("uses the shared Office page header and secondary action button", () => {
    expect(analyticsSource).toContain("OfficeZohoPageHeader");
    expect(analyticsSource).toContain("OfficeZohoSecondaryButton");
    expect(analyticsSource).toContain('title="Analytics"');
  });

  it("does not rebuild the Analytics h1 header locally", () => {
    expect(analyticsSource).not.toContain('<h1 className="text-2xl font-bold text-slate-900">Analytics</h1>');
  });

  it("preserves refresh and date-range behavior", () => {
    expect(analyticsSource).toContain("onClick={() => void refetch()}");
    expect(analyticsSource).toContain("disabled={loading}");
    expect(analyticsSource).toContain("<AnalyticsDateRangePicker value={range} onChange={setRange} />");
    expect(analyticsSource).toContain('"/api/admin/office-analytics"');
  });
});
