import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const pagePath = path.join(root, "app/(ui-redesign)/office/cleaner-performance/page.tsx");
const shellPath = path.join(root, "src/features/office/OfficeShell.tsx");

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

describe("SR-11L Office cleaner performance semantic main contract", () => {
  it("keeps OfficeShell as the canonical main landmark", () => {
    const shell = read(shellPath);
    expect(shell).toContain('<main className="min-w-0 flex-1">');
  });

  it("does not nest another main landmark inside cleaner performance", () => {
    const page = read(pagePath);
    expect(page).toContain('<div className="space-y-6">');
    expect(page).not.toContain('<main className="space-y-6">');
    expect(page).not.toContain("</main>");
  });

  it("preserves the cleaner performance behavior contracts", () => {
    const page = read(pagePath);
    expect(page).toContain('/api/admin/cleaner-performance?days=${days}');
    expect(page).toContain("OfficeZohoSelect");
    expect(page).toContain("OfficeZohoStatusBadge");
    expect(page).toContain("OfficeZohoTableShell");
    expect(page).toContain("void refetch()");
    expect(page).toContain("Cleaner Performance Scorecards");
  });
});
