import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "app/(ui-redesign)/office/ops-health/page.tsx"),
  "utf8",
);

describe("SR-11C Ops Health shared chrome contract", () => {
  it("uses the shared Office page header and secondary action button", () => {
    expect(source).toContain("OfficeZohoPageHeader");
    expect(source).toContain("OfficeZohoSecondaryButton");
    expect(source).toContain('title="Ops Health"');
  });

  it("does not rebuild the old local Ops Health h1 header", () => {
    expect(source).not.toContain('<h1 className="text-2xl font-bold text-slate-900">Ops Health</h1>');
  });

  it("preserves refresh and ops-health data behavior", () => {
    expect(source).toContain('"/api/admin/office-ops-health"');
    expect(source).toContain("onClick={() => void refetch()}");
    expect(source).toContain("disabled={loading}");
    expect(source).toContain("includeAcknowledged");
    expect(source).toContain("<OpsHealthFullPanel");
  });
});
