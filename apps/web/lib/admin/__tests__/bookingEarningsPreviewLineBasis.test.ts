import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));

import { buildBookingEarningsPreview } from "@/lib/admin/buildBookingEarningsPreview";
import { bookingEarningsPreviewComparison } from "@/lib/admin/bookingEarningsPreviewComparison";
import type { EarningsLineItemInput } from "@/lib/payout/computeEarningsFromLineItems";

const bookingId = "00000000-0000-4000-8000-000000000001";
const cleanerId = "00000000-0000-4000-8000-000000000002";

function fixture(options: {
  date?: string;
  team?: boolean;
  paired?: boolean;
  lockedBasis?: number;
  lineError?: boolean;
  lines?: EarningsLineItemInput[];
  baseCents?: number;
  deductionCents?: number;
} = {}) {
  const amountCents = options.paired ? 66_000 : 36_000;
  const basis = options.lockedBasis ?? 25_200;
  const booking = {
    id: bookingId,
    date: options.date ?? "2026-10-08",
    time: "09:00",
    service: "standard",
    cleaner_id: cleanerId,
    payout_owner_cleaner_id: cleanerId,
    is_team_job: options.team ?? false,
    earnings_policy: options.lockedBasis ? "legacy_july" : "current_v1",
    base_amount_cents: options.baseCents ?? null,
    service_fee_cents: 0,
    total_paid_zar: amountCents / 100,
    total_paid_cents: null,
    amount_paid_cents: amountCents,
    price_snapshot: { v: 1, base_price: amountCents / 100, total_price: amountCents / 100 },
    display_earnings_cents: basis,
    cleaner_payout_cents: basis,
    cleaner_bonus_cents: 0,
    internal_earnings_cents: basis * (options.paired ? 2 : 1),
    cleaner_earnings_total_cents: 25_000,
    earnings_summary: null,
  };
  const reads: string[] = [];
  const lines = options.lines ?? [{ id: "line", item_type: "base", total_price_cents: amountCents }];
  const roster = options.paired ? [
    { cleaner_id: cleanerId, role: "lead" },
    { cleaner_id: "00000000-0000-4000-8000-000000000003", role: "member" },
  ] : [];
  const mutation = vi.fn(() => { throw new Error("Preview attempted a write"); });
  const admin = {
    from: (table: string) => {
      reads.push(table);
      const result = {
        data: table === "bookings" ? booking
          : table === "cleaners" ? { joined_at: "2026-05-01" }
            : table === "booking_line_items"
              ? lines : table === "booking_cleaners" ? roster
                : table === "cleaner_earnings_adjustments" && options.deductionCents
                  ? [{ cleaner_id: cleanerId, amount_cents: -options.deductionCents, reason: "test deduction" }]
                  : [],
        error: table === "booking_line_items" && options.lineError ? { message: "unavailable" } : null,
      };
      const q = {
        select: () => q, eq: () => q, order: () => q,
        maybeSingle: async () => result,
        insert: mutation, update: mutation, upsert: mutation, delete: mutation,
        then: (done: (value: unknown) => unknown) => Promise.resolve(result).then(done),
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { admin, reads, mutation };
}

describe("reset preview uses the stored eligible line price", () => {
  it("projects R252 from the R360 service line despite a legacy ZAR snapshot", async () => {
    const { admin, mutation } = fixture();
    const result = await buildBookingEarningsPreview(admin, bookingId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.preview.computed_preview?.total_cleaner_earnings_cents).toBe(25_200);
    expect(bookingEarningsPreviewComparison(result.preview)).toEqual({
      currentTotalCents: 25_200, projectedTotalCents: 25_200, diffCents: 0,
    });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("includes eligible extras and excludes company-only charges", async () => {
    const { admin } = fixture({ lines: [
      { id: "base", item_type: "base", total_price_cents: 30_000 },
      { id: "oven", item_type: "extra", slug: "inside-oven", total_price_cents: 6_000 },
      { id: "fee", item_type: "adjustment", name: "Service fee", total_price_cents: 8_000 },
      { id: "supplies", item_type: "extra", slug: "supplies-kit", total_price_cents: 4_000 },
      { id: "excluded", item_type: "base", earns_cleaner: false, total_price_cents: 5_000 },
    ] });
    const result = await buildBookingEarningsPreview(admin, bookingId);
    expect(result.ok && result.preview.computed_preview?.total_cleaner_earnings_cents).toBe(25_200);
  });

  it("withholds the projection if the line basis cannot be verified", async () => {
    const { admin, mutation } = fixture({ lineError: true });
    const result = await buildBookingEarningsPreview(admin, bookingId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.preview.computed_preview).toBeNull();
    expect(result.preview.preview_unavailable_reason).toBe("compute_failed");
    expect(bookingEarningsPreviewComparison(result.preview)).toBeNull();
    expect(mutation).not.toHaveBeenCalled();
  });

  it("retains the locked R280 solo basis", async () => {
    const { admin } = fixture({ lockedBasis: 28_000 });
    const result = await buildBookingEarningsPreview(admin, bookingId);
    expect(result.ok && result.preview.computed_preview?.total_cleaner_earnings_cents).toBe(28_000);
  });

  it("retains R260 for both paired participants and R520 total", async () => {
    const { admin } = fixture({ paired: true, lockedBasis: 26_000 });
    const result = await buildBookingEarningsPreview(admin, bookingId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.preview.computed_preview?.total_cleaner_earnings_cents).toBe(52_000);
    expect(result.preview.computed_preview?.per_cleaner_earnings.map(x => x.total_cents)).toEqual([26_000, 26_000]);
  });

  it.each([
    { lines: [] },
    { lines: [{ id: "fee", item_type: "adjustment", name: "Service fee", total_price_cents: 1_000 }] },
  ])(
    "withholds approval rather than quoting a fallback when no positive eligible line basis exists (%j)",
    async ({ lines }) => {
      const { admin } = fixture({ lines, baseCents: 36_000 });
      const result = await buildBookingEarningsPreview(admin, bookingId);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.preview.computed_preview).toBeNull();
      expect(bookingEarningsPreviewComparison(result.preview)).toBeNull();
    },
  );

  it("keeps a verified zero-earnings projection available after a full deduction", async () => {
    const { admin } = fixture({ deductionCents: 30_000 });
    const result = await buildBookingEarningsPreview(admin, bookingId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(bookingEarningsPreviewComparison(result.preview)).toEqual({
      currentTotalCents: 25_200, projectedTotalCents: 0, diffCents: -25_200,
    });
  });

  it.each(["2026-05-15", "2026-09-30", "", "2026-10-32"])(
    "preserves the prior preview path for historical or invalid visit date %s", async date => {
      const { admin, reads } = fixture({ date });
      await buildBookingEarningsPreview(admin, bookingId);
      expect(reads).not.toContain("booking_line_items");
    },
  );

  it("preserves the formal-team preview path", async () => {
    const { admin, reads } = fixture({ team: true, paired: true });
    await buildBookingEarningsPreview(admin, bookingId);
    expect(reads).not.toContain("booking_line_items");
  });
});
