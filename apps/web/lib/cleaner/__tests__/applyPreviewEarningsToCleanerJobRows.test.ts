import { describe, expect, it, vi } from "vitest";
import { applyPreviewEarningsToCleanerJobRows } from "@/lib/cleaner/applyPreviewEarningsToCleanerJobRows";

const previewMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/payout/persistCleanerPayout", () => ({
  previewDisplayEarningsCentsForCleanerJob: previewMock,
}));

describe("applyPreviewEarningsToCleanerJobRows", () => {
  it("marks estimate when preview fills null persisted earnings", async () => {
    previewMock.mockResolvedValueOnce(25_000);
    const admin = {} as never;
    const out = await applyPreviewEarningsToCleanerJobRows(admin, {
      cleanerId: "c1",
      rows: [
        {
          id: "b1",
          cleaner_earnings_total_cents: null,
          payout_frozen_cents: null,
          display_earnings_cents: null,
        },
      ],
      maxPreviews: 50,
    });
    expect(previewMock).toHaveBeenCalledWith(admin, { bookingId: "b1", cleanerId: "c1" });
    expect(out[0]!.displayEarningsCents).toBe(25_000);
    expect(out[0]!.displayEarningsIsEstimate).toBe(true);
    expect(out[0]!.earnings_estimated).toBe(true);
    expect(out[0]!.earnings_is_estimate).toBe(true);
  });

  it("does not preview when resolved earnings exist on row", async () => {
    previewMock.mockClear();
    const admin = {} as never;
    const out = await applyPreviewEarningsToCleanerJobRows(admin, {
      cleanerId: "c1",
      rows: [
        {
          id: "b2",
          cleaner_earnings_total_cents: null,
          payout_frozen_cents: null,
          display_earnings_cents: 18_000,
        },
      ],
      maxPreviews: 50,
    });
    expect(previewMock).not.toHaveBeenCalled();
    expect(out[0]!.displayEarningsCents).toBe(18_000);
    expect(out[0]!.displayEarningsIsEstimate).toBe(false);
    expect(out[0]!.earnings_is_estimate).toBe(false);
  });

  it("respects maxPreviews cap", async () => {
    previewMock.mockResolvedValue(10_000);
    const admin = {} as never;
    const out = await applyPreviewEarningsToCleanerJobRows(admin, {
      cleanerId: "c1",
      rows: [
        { id: "a1", display_earnings_cents: null },
        { id: "a2", display_earnings_cents: null },
        { id: "a3", display_earnings_cents: null },
      ],
      maxPreviews: 2,
    });
    expect(previewMock).toHaveBeenCalledTimes(2);
    expect((out[2] as { displayEarningsCents?: unknown }).displayEarningsCents).toBeUndefined();
  });
});
