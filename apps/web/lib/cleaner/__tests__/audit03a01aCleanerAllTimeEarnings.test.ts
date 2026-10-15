import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { sumCleanerAllTimeEarningsFromRows } from "@/lib/cleaner/fetchCleanerAllTimeEarningsCents";

describe("AUDIT-03A-01A cleaner all-time earnings source of truth", () => {
  it("sums booking truth, honors viewer payout precedence, and suppresses active removals", () => {
    const cleanerId = "11111111-1111-4111-8111-111111111111";
    const removedBy = "22222222-2222-4222-8222-222222222222";
    const rows = [
      {
        id: "a",
        cleaner_id: cleanerId,
        payout_frozen_cents: 30_000,
        display_earnings_cents: 25_000,
      },
      {
        id: "b",
        cleaner_id: cleanerId,
        display_earnings_cents: 25_000,
      },
      {
        id: "c",
        cleaner_id: cleanerId,
        display_earnings_cents: 28_000,
        metadata: {
          payout_attribution_removal_v1: {
            active: true,
            cleaner_id: cleanerId,
            header_cleaner_id_at_removal: cleanerId,
            removed_at: "2026-10-13T00:00:00.000Z",
            removed_by_admin_id: removedBy,
            reason: null,
          },
        },
      },
      {
        id: "d",
        cleaner_id: cleanerId,
        is_team_job: true,
        display_earnings_cents: 25_000,
      },
      // Duplicate source-branch row must not double count.
      {
        id: "b",
        cleaner_id: cleanerId,
        display_earnings_cents: 25_000,
      },
    ];

    const viewerPayouts = new Map([["d", 27_000]]);
    expect(sumCleanerAllTimeEarningsFromRows(rows, cleanerId, viewerPayouts)).toBe(82_000);
  });

  it("profile-summary uses the shared booking-derived all-time helper, not the ledger table", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/cleaner/profile-summary/route.ts"),
      "utf8",
    );

    expect(source).toContain("fetchCleanerAllTimeEarningsCents");
    expect(source).not.toContain('.from("cleaner_earnings")');
    expect(source).not.toContain("earningsRows");
  });
  it("earnings API keeps booking/member truth authoritative until ledger convergence", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/cleaner/earnings/route.ts"),
      "utf8",
    );

    expect(source).toContain("fetchCleanerAllTimeEarningsCents");
    expect(source).toContain("const total_all_time = bookingAllTimeResult.total;");
    expect(source).toContain('const source_of_truth = "booking" as const;');
    expect(source).toContain("useLedgerTotals");
    expect(source).toContain("const useLedgerTotals = false;");
  });

});
