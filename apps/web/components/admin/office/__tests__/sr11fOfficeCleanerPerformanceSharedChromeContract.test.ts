import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = join(
  process.cwd(),
  "app/(ui-redesign)/office/cleaner-performance/page.tsx",
);
const source = readFileSync(pagePath, "utf8");

describe("SR-11F Office cleaner performance shared chrome contract", () => {
  it("uses shared Office page chrome", () => {
    expect(source).toContain("OfficeZohoPageHeader");
    expect(source).toContain("OfficeZohoSecondaryButton");
    expect(source).toContain('title="Cleaner Performance Scorecards"');
    expect(source).not.toContain('<header className="flex flex-wrap items-start justify-between gap-4">');
  });

  it("preserves period selection and refresh behavior", () => {
    expect(source).toContain("value={days}");
    expect(source).toContain("setDays(Number(e.target.value))");
    expect(source).toContain("<option value={30}>30 days</option>");
    expect(source).toContain("<option value={90}>90 days</option>");
    expect(source).toContain("<option value={180}>180 days</option>");
    expect(source).toContain("<option value={365}>365 days</option>");
    expect(source).toContain("onClick={() => void refetch()}");
  });

  it("preserves the cleaner performance data contract", () => {
    expect(source).toContain("/api/admin/cleaner-performance?days=${days}");
    expect(source).toContain("Earnings and payouts are not part of this score.");
    expect(source).toContain("Cleaner scorecards");
    expect(source).toContain("Missing evidence does not count as zero");
  });
});
