import { describe, expect, it } from "vitest";
import { applyPreviewEarningsToCleanerJobRows } from "@/lib/cleaner/applyPreviewEarningsToCleanerJobRows";

describe("applyPreviewEarningsToCleanerJobRows", () => {
  it("sets earnings_basis_pending when no cents resolved and previews are exhausted", async () => {
    const admin = {} as never;
    const rows: Record<string, unknown>[] = [
      {
        id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
        cleaner_earnings_total_cents: null,
        payout_frozen_cents: null,
        display_earnings_cents: null,
      },
    ];
    const out = await applyPreviewEarningsToCleanerJobRows(admin, {
      cleanerId: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
      rows,
      maxPreviews: 0,
    });
    expect(out[0]?.earnings_basis_pending).toBe(true);
    expect(out[0]?.displayEarningsCents ?? out[0]?.display_earnings_cents).toBeNull();
  });
});
