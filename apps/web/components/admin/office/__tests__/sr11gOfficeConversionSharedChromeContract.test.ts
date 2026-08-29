import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const page = fs.readFileSync(
  path.join(root, "app/(ui-redesign)/office/conversion/page.tsx"),
  "utf8",
);

describe("SR-11G Office conversion shared chrome contract", () => {
  it("uses the canonical shared Office page header and secondary action", () => {
    expect(page).toContain("OfficeZohoPageHeader");
    expect(page).toContain('title="Conversion"');
    expect(page).toContain("OfficeZohoSecondaryButton");
    expect(page).not.toContain('<h1 className="text-2xl font-bold text-slate-900">Conversion</h1>');
  });

  it("preserves the existing conversion data and interaction contract", () => {
    expect(page).toContain('useAdminData<SeoLanding>("/api/admin/seo-attribution")');
    expect(page).toContain("void seo.refetch()");
    expect(page).toContain("landingDisplayName");
    expect(page).toContain("PAGE_SIZE_OPTIONS");
    expect(page).toContain("setPageSize(Number(e.target.value))");
    expect(page).toContain("DIRECT_BOOKING_FLOW_LANDING");
    expect(page).toContain("Daily funnel activity (last 7 days)");
  });
});
