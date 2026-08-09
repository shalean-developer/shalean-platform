import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), "utf8");

const route = read("apps/web/app/api/cleaner/performance/route.ts");
const mobileApi = read("apps/mobile/services/cleanerApi.ts");
const mobileScreen = read("apps/mobile/app/(cleaner)/performance.tsx");
const webCard = read("apps/web/components/cleaner-dashboard/CleanerPerformanceCard.tsx");

describe("P6 cleaner self performance convergence", () => {
  it("resolves the signed-in cleaner rather than accepting arbitrary cleaner ids", () => {
    expect(route).toContain("resolveCleanerIdFromRequest");
    expect(route).toContain("cleanerId: session.cleanerId");
    expect(route).not.toContain("cleaner_id");
  });

  it("uses the canonical workforce scorecard service", () => {
    expect(route).toContain("loadCleanerPerformanceScorecards");
    expect(route).toContain("scorecard");
  });

  it("connects cleaner mobile to the canonical endpoint and surfaces failures", () => {
    expect(mobileApi).toContain("/api/cleaner/performance");
    expect(mobileScreen).toContain("useCleanerPerformance(90)");
    expect(mobileScreen).toContain("Quality inspections");
    expect(mobileScreen).toContain("Performance score unavailable");
    expect(mobileScreen).toContain("Retry performance score");
  });

  it("mounts canonical performance through the active web stats row", () => {
    expect(webCard).toContain("useCanonicalCleanerPerformance");
    expect(webCard).toContain("Performance");
    expect(webCard).toContain("Evidence");
  });
});
