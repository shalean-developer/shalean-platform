import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/dispatch/dispatchOffers", () => ({
  createDispatchOfferRow: vi.fn(),
}));
vi.mock("@/lib/booking/checkoutDispatchOfferFailureEscalation", () => ({
  escalateFailedCheckoutDispatchOffer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));
vi.mock("@/lib/booking/availabilityEngine", () => ({
  isCleanerInAvailablePoolForSlot: vi.fn(),
}));

import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import { maybeRetrySameCleanerAfterFirstOfferExpiry } from "@/lib/dispatch/userSelectedOfferExpiryRetry";
import { isCleanerInAvailablePoolForSlot } from "@/lib/booking/availabilityEngine";

const createOfferMock = vi.mocked(createDispatchOfferRow);
const poolMock = vi.mocked(isCleanerInAvailablePoolForSlot);

function dispatchOffersHeadMock(
  bookingId: string,
  selectedCleanerId: string,
  getPending: () => number,
  expired: number,
) {
  return {
    select: vi.fn((_c: string, _o?: unknown) => ({
      eq: vi.fn((col: string, val: unknown) => {
        expect(col).toBe("booking_id");
        expect(val).toBe(bookingId);
        return {
          eq: vi.fn((col2: string, val2: unknown) => {
            if (col2 === "status" && val2 === "pending") {
              return Promise.resolve({ count: getPending(), error: null });
            }
            if (col2 === "cleaner_id" && val2 === selectedCleanerId) {
              return {
                eq: vi.fn(async (col3: string, val3: unknown) => {
                  expect(col3).toBe("status");
                  expect(val3).toBe("expired");
                  return { count: expired, error: null };
                }),
              };
            }
            throw new Error(`unexpected dispatch_offers eq chain: ${col2}=${String(val2)}`);
          }),
        };
      }),
    })),
  };
}

function supabaseForRetry(booking: Record<string, unknown>, offerMock: ReturnType<typeof dispatchOffersHeadMock>) {
  return {
    from: vi.fn((table: string) => {
      if (table === "dispatch_offers") return offerMock;
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: booking, error: null })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as unknown as SupabaseClient;
}

const baseBooking = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "pending_assignment",
  cleaner_id: null,
  assignment_type: "user_selected",
  selected_cleaner_id: "00000000-0000-4000-8000-0000000000aa",
  dispatch_attempt_count: 0,
  date: "2026-05-15",
  time: "09:00",
  duration_minutes: 120,
  location_id: null,
  service_slug: "standard",
  service: "Standard",
  booking_snapshot: { v: 1, flat: { service: "standard", date: "2026-05-15", time: "09:00" } },
  paystack_reference: "ref_test",
};

describe("maybeRetrySameCleanerAfterFirstOfferExpiry", () => {
  beforeEach(() => {
    createOfferMock.mockReset();
    poolMock.mockReset();
    poolMock.mockResolvedValue(true);
  });

  it("returns proceed_fallback when pending offers exist", async () => {
    const offers = dispatchOffersHeadMock(baseBooking.id, baseBooking.selected_cleaner_id as string, () => 1, 1);
    const sb = supabaseForRetry(baseBooking, offers);
    const r = await maybeRetrySameCleanerAfterFirstOfferExpiry(sb, {
      bookingId: baseBooking.id,
      selectedCleanerId: baseBooking.selected_cleaner_id as string,
    });
    expect(r.kind).toBe("proceed_fallback");
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it("returns proceed_fallback when expired count is not exactly 1", async () => {
    const offers = dispatchOffersHeadMock(baseBooking.id, baseBooking.selected_cleaner_id as string, () => 0, 2);
    const sb = supabaseForRetry(baseBooking, offers);
    const r = await maybeRetrySameCleanerAfterFirstOfferExpiry(sb, {
      bookingId: baseBooking.id,
      selectedCleanerId: baseBooking.selected_cleaner_id as string,
    });
    expect(r.kind).toBe("proceed_fallback");
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it("returns proceed_fallback when cleaner no longer in pool", async () => {
    poolMock.mockResolvedValue(false);
    const offers = dispatchOffersHeadMock(baseBooking.id, baseBooking.selected_cleaner_id as string, () => 0, 1);
    const sb = supabaseForRetry(baseBooking, offers);
    const r = await maybeRetrySameCleanerAfterFirstOfferExpiry(sb, {
      bookingId: baseBooking.id,
      selectedCleanerId: baseBooking.selected_cleaner_id as string,
    });
    expect(r.kind).toBe("proceed_fallback");
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it("creates one retry offer on first expiry when eligible", async () => {
    createOfferMock.mockResolvedValue({
      ok: true,
      offerId: "offer-retry-1",
      expiresAtIso: "2026-05-15T10:00:00.000Z",
    });
    const offers = dispatchOffersHeadMock(baseBooking.id, baseBooking.selected_cleaner_id as string, () => 0, 1);
    const sb = supabaseForRetry(baseBooking, offers);
    const r = await maybeRetrySameCleanerAfterFirstOfferExpiry(sb, {
      bookingId: baseBooking.id,
      selectedCleanerId: baseBooking.selected_cleaner_id as string,
    });
    expect(r.kind).toBe("retry_offer_created");
    expect(createOfferMock).toHaveBeenCalledTimes(1);
    expect(createOfferMock.mock.calls[0]?.[0]).toMatchObject({
      bookingId: baseBooking.id,
      cleanerId: baseBooking.selected_cleaner_id,
      rankIndex: 0,
    });
    expect(poolMock).toHaveBeenCalled();
  });

  it("treats unique pending violation as success when a pending offer exists after", async () => {
    let pendingPoll = 0;
    createOfferMock.mockResolvedValue({
      ok: false,
      error: 'duplicate key value violates unique constraint "dispatch_offers_booking_cleaner_pending_uidx"',
    });
    const offers = dispatchOffersHeadMock(
      baseBooking.id,
      baseBooking.selected_cleaner_id as string,
      () => {
        pendingPoll += 1;
        return pendingPoll === 2 ? 1 : 0;
      },
      1,
    );
    const sb = supabaseForRetry(baseBooking, offers);
    const r = await maybeRetrySameCleanerAfterFirstOfferExpiry(sb, {
      bookingId: baseBooking.id,
      selectedCleanerId: baseBooking.selected_cleaner_id as string,
    });
    expect(r.kind).toBe("retry_offer_created");
  });
});
