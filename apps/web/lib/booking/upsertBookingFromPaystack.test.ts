import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/booking/failedJobs", () => ({
  enqueueFailedJob: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/recordSystemMetric", () => ({
  recordSystemMetric: vi.fn().mockResolvedValue(undefined),
}));

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseCheckoutPriceSnapshotV1FromMeta } from "@/lib/booking/priceSnapshotBooking";
import { upsertBookingFromPaystack } from "@/lib/booking/upsertBookingFromPaystack";

const getSupabaseAdminMock = vi.mocked(getSupabaseAdmin);

function bookingSelectOnce(data: unknown, error: { message: string } | null = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data, error })),
        })),
      })),
    })),
  };
}

describe("parseCheckoutPriceSnapshotV1FromMeta (Paystack string metadata)", () => {
  const minimalCheckoutSnap = {
    version: 1,
    currency: "ZAR",
    total_zar: 500,
    subtotal_zar: 400,
    extras_total_zar: 50,
    discount_zar: 0,
    tip_zar: 50,
    visit_total_zar: 450,
    duration_hours: 3,
    cleaners_count: 1,
    line_items: [{ id: "a", name: "Visit", amount_zar: 450 }],
    pricing_version_id: null as string | null,
  };

  it("accepts stringified price_snapshot", () => {
    const out = parseCheckoutPriceSnapshotV1FromMeta({
      price_snapshot: JSON.stringify(minimalCheckoutSnap),
    });
    expect(out).not.toBeNull();
    expect(out?.total_zar).toBe(500);
  });

  it("accepts double-encoded JSON string", () => {
    const once = JSON.stringify(minimalCheckoutSnap);
    const out = parseCheckoutPriceSnapshotV1FromMeta({
      price_snapshot: JSON.stringify(once),
    });
    expect(out).not.toBeNull();
    expect(out?.total_zar).toBe(500);
  });

  it("accepts version/currency as loose strings", () => {
    const loose = { ...minimalCheckoutSnap, version: "1" as unknown as number, currency: "zar" };
    const out = parseCheckoutPriceSnapshotV1FromMeta({
      price_snapshot: JSON.stringify(loose),
    });
    expect(out).not.toBeNull();
    expect(out?.total_zar).toBe(500);
  });
});

describe("upsertBookingFromPaystack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if price snapshot missing", async () => {
    getSupabaseAdminMock.mockReturnValue(
      bookingSelectOnce(null) as unknown as ReturnType<typeof getSupabaseAdmin>,
    );
    await expect(
      upsertBookingFromPaystack({
        paystackReference: "ref-missing-snap",
        amountCents: 10_000,
        currency: "ZAR",
        customerEmail: "a@b.co",
        snapshot: { locked: { locked: true, lockedAt: new Date().toISOString() } } as never,
        paystackMetadata: {},
      }),
    ).rejects.toThrow(/Missing price snapshot/i);
  });

  it("returns skipped if booking already finalized (non pending_payment)", async () => {
    getSupabaseAdminMock.mockReturnValue(
      bookingSelectOnce({
        id: "00000000-0000-4000-8000-000000000001",
        status: "pending",
        is_recurring_generated: false,
        price_snapshot: null,
      }) as unknown as ReturnType<typeof getSupabaseAdmin>,
    );
    const result = await upsertBookingFromPaystack({
      paystackReference: "ref-already-paid",
      amountCents: 10_000,
      currency: "ZAR",
      customerEmail: "a@b.co",
      snapshot: null,
      paystackMetadata: {},
    });
    expect(result.skipped).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.bookingId).toBe("00000000-0000-4000-8000-000000000001");
  });
});
