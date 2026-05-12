import { describe, expect, it, vi } from "vitest";

const { previewMock } = vi.hoisted(() => ({
  previewMock: vi.fn(async (_admin: unknown, _params: unknown) => null as number | null),
}));

vi.mock("@/lib/payout/persistCleanerPayout", () => ({
  previewDisplayEarningsCentsForCleanerJob: previewMock,
}));

import { applyPreviewEarningsToCleanerJobRows } from "@/lib/cleaner/applyPreviewEarningsToCleanerJobRows";

const BID = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
const CID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const admin = {} as never;

describe("applyPreviewEarningsToCleanerJobRows", () => {
  it("sets earnings_basis_pending when no cents resolved and previews are exhausted", async () => {
    previewMock.mockReset();
    const rows: Record<string, unknown>[] = [
      {
        id: BID,
        cleaner_earnings_total_cents: null,
        payout_frozen_cents: null,
        display_earnings_cents: null,
      },
    ];
    const out = await applyPreviewEarningsToCleanerJobRows(admin, {
      cleanerId: CID,
      rows,
      maxPreviews: 0,
    });
    expect(out[0]?.earnings_basis_pending).toBe(true);
    expect(out[0]?.displayEarningsCents ?? out[0]?.display_earnings_cents).toBeNull();
  });

  /**
   * Acceptance rule: persisted `0` is "missing" — must fall through to runtime preview.
   * Cleaner card never shows `R 0`.
   */
  it("treats stale persisted display_earnings_cents=0 as missing and runs preview (positive → estimate)", async () => {
    previewMock.mockReset();
    previewMock.mockResolvedValue(50000);
    const rows: Record<string, unknown>[] = [
      {
        id: BID,
        cleaner_earnings_total_cents: null,
        payout_frozen_cents: null,
        display_earnings_cents: 0,
      },
    ];
    const out = await applyPreviewEarningsToCleanerJobRows(admin, {
      cleanerId: CID,
      rows,
      maxPreviews: 5,
    });
    expect(previewMock).toHaveBeenCalledTimes(1);
    expect(out[0]?.displayEarningsCents).toBe(50000);
    expect(out[0]?.display_earnings_cents).toBe(50000);
    expect(out[0]?.earnings_cents).toBe(50000);
    expect(out[0]?.earnings_estimated).toBe(true);
    expect(out[0]?.earnings_basis_pending).toBe(false);
  });

  it("preview returning 0 (truly invalid) emits earnings_basis_pending=true; never wires R0", async () => {
    previewMock.mockReset();
    previewMock.mockResolvedValue(0);
    const rows: Record<string, unknown>[] = [
      {
        id: BID,
        cleaner_earnings_total_cents: null,
        payout_frozen_cents: null,
        display_earnings_cents: 0,
      },
    ];
    const out = await applyPreviewEarningsToCleanerJobRows(admin, {
      cleanerId: CID,
      rows,
      maxPreviews: 5,
    });
    expect(out[0]?.earnings_basis_pending).toBe(true);
    expect(out[0]?.displayEarningsCents).toBeNull();
    expect(out[0]?.display_earnings_cents).toBeNull();
    expect(out[0]?.earnings_cents).toBeNull();
  });

  it("uses persisted positive value directly (no preview) when display_earnings_cents > 0", async () => {
    previewMock.mockReset();
    const rows: Record<string, unknown>[] = [
      {
        id: BID,
        cleaner_earnings_total_cents: null,
        payout_frozen_cents: null,
        display_earnings_cents: 30000,
      },
    ];
    const out = await applyPreviewEarningsToCleanerJobRows(admin, {
      cleanerId: CID,
      rows,
      maxPreviews: 5,
    });
    expect(previewMock).not.toHaveBeenCalled();
    expect(out[0]?.displayEarningsCents).toBe(30000);
    expect(out[0]?.earnings_estimated).toBe(false);
    expect(out[0]?.earnings_basis_pending).toBe(false);
  });

  it("respects preview cap: persisted 0 + cap exhausted → earnings_basis_pending, null wire", async () => {
    previewMock.mockReset();
    previewMock.mockResolvedValue(99999);
    const rows: Record<string, unknown>[] = [
      {
        id: BID,
        cleaner_earnings_total_cents: null,
        payout_frozen_cents: null,
        display_earnings_cents: 0,
      },
    ];
    const out = await applyPreviewEarningsToCleanerJobRows(admin, {
      cleanerId: CID,
      rows,
      maxPreviews: 0,
    });
    expect(previewMock).not.toHaveBeenCalled();
    expect(out[0]?.earnings_basis_pending).toBe(true);
    expect(out[0]?.displayEarningsCents).toBeNull();
  });
});
