import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "..", "..");
const dashboard = readFileSync(
  join(root, "apps/web/app/(ui-redesign)/office/funnel-intelligence/page.tsx"),
  "utf8",
);
const homepage = readFileSync(
  join(root, "apps/web/components/marketing-home/sections/MarketingHomeCoreServicesSection.tsx"),
  "utf8",
);

describe("Funnel Intelligence homepage design alignment", () => {
  it("uses the canonical Shalean homepage card radius, border and elevation", () => {
    expect(homepage).toContain("rounded-lg border border-[#DCE7FF]");
    expect(dashboard).toContain("rounded-lg border border-[#DCE7FF] bg-white p-5 shadow-[var(--ui-shadow-sm)]");
    expect(dashboard).toContain("rounded-lg border border-[#DCE7FF] bg-[#F5F7FB]");
    expect(dashboard).not.toContain("rounded-2xl border border-slate-100");
  });

  it("uses homepage brand-blue CTA styling with accessible focus and disabled states", () => {
    expect(homepage).toContain("bg-[#0051FF]");
    expect(dashboard).toContain('rounded-md bg-[#0051FF] px-5');
    expect(dashboard).toContain("hover:bg-[#0033A1]");
    expect(dashboard).toContain("focus-visible:ring-2");
    expect(dashboard).toContain("disabled:opacity-50");
    expect(dashboard).toContain("onClick={onRefresh}");
  });

  it("retains real metrics, finance warnings and error states", () => {
    expect(dashboard).toContain("buildOfficeFunnelRevenueMetrics(data)");
    expect(dashboard).toContain("buildOfficeFunnelSteps(data)");
    expect(dashboard).toContain("dailyTrendBarHeights(d, max)");
    expect(dashboard).toContain("not settled cash");
    expect(dashboard).toContain("not reconciled with payment providers or bank receipts");
    expect(dashboard).toContain("bg-red-50");
  });
});
