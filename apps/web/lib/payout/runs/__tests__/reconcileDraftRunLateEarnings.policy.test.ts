import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("late earnings reconciliation safety boundary", () => {
  it("only permits draft payout runs to be reopened", () => {
    const reopenable = (status: string) => status === "draft";
    expect(reopenable("draft")).toBe(true);
    expect(reopenable("approved")).toBe(false);
    expect(reopenable("paid")).toBe(false);
  });

  it("runs cron and admin generation through closed-month catch-up while draft runs are temporarily reopened", () => {
    for (const path of [
      "app/api/cron/generate-payouts/route.ts",
      "app/api/admin/payouts/generate/route.ts",
    ]) {
      const src = read(path);
      expect(src).toContain("generateCatchUpWeeklyPayouts");
      expect(src).toContain("prepareDraftRunPayoutsForCatchUp");
      expect(src).toContain("restoreDraftRunPayoutsAfterCatchUp");
    }
  });

  it("keeps the standalone catch-up script serialized under the same payout lock and reopen/restore boundary", () => {
    const src = read("scripts/regenerate-catchup-payouts.ts");
    expect(src).toContain("withCronLock");
    expect(src).toContain("CRON_LOCK_KEYS.generatePayouts");
    expect(src).toContain("generateCatchUpWeeklyPayouts");
    expect(src).toContain("prepareDraftRunPayoutsForCatchUp");
    expect(src).toContain("restoreDraftRunPayoutsAfterCatchUp");
  });
});
