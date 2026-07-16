import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSoloCompletionOwnerStamp } from "@/lib/payout/ensureCleanerEarningsLedger";

describe("runCleanerBookingLifecycleAction complete stamps cleaner_id", () => {
  it("completion path uses buildSoloCompletionOwnerStamp + ledger ensure", () => {
    const src = readFileSync(join(process.cwd(), "lib/cleaner/runCleanerBookingLifecycleAction.ts"), "utf8");
    expect(src).toContain("buildSoloCompletionOwnerStamp");
    expect(src).toContain("ensureCleanerEarningsLedgerRow");
    expect(src).toContain("completionOwnerPatch");
  });

  it("cron auto-complete uses the same owner stamp helper", () => {
    const src = readFileSync(join(process.cwd(), "app/api/cron/booking-lifecycle/route.ts"), "utf8");
    expect(src).toContain("buildSoloCompletionOwnerStamp");
    expect(src).toContain("ensureCleanerEarningsLedgerRow");
  });

  it("solo stamp + team skip behaviour matches BEA-PAYOUT-001 contract", () => {
    expect(
      buildSoloCompletionOwnerStamp({
        isTeamJob: false,
        existingCleanerId: null,
        existingPayoutOwnerId: null,
        ownerId: "c1",
      }),
    ).toEqual({ cleaner_id: "c1", payout_owner_cleaner_id: "c1" });
    expect(
      buildSoloCompletionOwnerStamp({
        isTeamJob: true,
        existingCleanerId: null,
        existingPayoutOwnerId: null,
        ownerId: "c1",
      }),
    ).toEqual({});
  });
});
