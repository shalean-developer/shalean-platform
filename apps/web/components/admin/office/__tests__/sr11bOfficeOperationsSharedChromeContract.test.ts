import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const operationsSource = fs.readFileSync(
  path.resolve(process.cwd(), "app/(ui-redesign)/office/operations/page.tsx"),
  "utf8",
);

describe("SR-11B Office Operations shared chrome contract", () => {
  it("uses the shared Office page header and secondary action button", () => {
    expect(operationsSource).toContain("OfficeZohoPageHeader");
    expect(operationsSource).toContain("OfficeZohoSecondaryButton");
    expect(operationsSource).toContain('title="Operations"');
  });

  it("does not rebuild the old Operations h1 header locally", () => {
    expect(operationsSource).not.toContain('<h1 className="text-2xl font-bold text-slate-900">Operations</h1>');
  });

  it("preserves refresh and operations data behavior", () => {
    expect(operationsSource).toContain("onClick={() => void refetch()}");
    expect(operationsSource).toContain('"/api/admin/office-operations"');
    expect(operationsSource).toContain("const issues = data?.issues ?? []");
    expect(operationsSource).toContain("const supplyDemand = data?.supplyDemand ?? []");
  });
});
