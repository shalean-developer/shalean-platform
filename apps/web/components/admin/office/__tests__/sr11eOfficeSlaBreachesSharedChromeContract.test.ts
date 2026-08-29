import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = path.join(process.cwd(), "app/(ui-redesign)/office/sla-breaches/page.tsx");
const source = fs.readFileSync(pagePath, "utf8");

describe("SR-11E Office SLA breaches shared chrome contract", () => {
  it("uses the shared Office page header and secondary button", () => {
    expect(source).toContain("OfficeZohoPageHeader");
    expect(source).toContain("OfficeZohoSecondaryButton");
    expect(source).toContain('title="SLA Breaches"');
    expect(source).not.toContain('<h1 className="text-2xl font-bold text-slate-900">SLA Breaches</h1>');
  });

  it("preserves SLA data and refresh behavior", () => {
    expect(source).toContain('useAdminData<BookingsResponse>("/api/admin/bookings"');
    expect(source).toContain('params: { filter: "sla" }');
    expect(source).toContain('onClick={() => void refetch()}');
    expect(source).toContain('aria-label="Refresh SLA breaches"');
  });

  it("preserves priority assignment navigation", () => {
    expect(source).toContain('href="/office/bookings"');
    expect(source).toContain("Assign all unassigned");
    expect(source).toContain('href={`/office/bookings/${b.id}`}');
    expect(source).toContain("Assign now");
  });
});
