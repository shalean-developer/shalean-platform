/**
 * Princess PR C — callback (verify) vs webhook ordering + duplicate init protection.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.fn();

vi.mock("@/lib/booking/upsertBookingFromPaystack", () => ({
  upsertBookingFromPaystack: (...args: unknown[]) => upsertMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: async () => ({ error: null }),
    }),
  })),
}));

vi.mock("@/lib/referrals/validateReferral", () => ({
  recordReferralCheckoutRedemption: vi.fn().mockResolvedValue({ outcome: "skipped" }),
}));

vi.mock("@/lib/notifications/notifyBookingEvent", () => ({
  notifyBookingEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/booking/failedJobs", () => ({
  enqueueFailedJob: vi.fn().mockResolvedValue(true),
}));

import { finalizePaystackChargeSuccess } from "@/lib/booking/finalizePaystackChargeSuccess";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";

const BOOKING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REF = `pay_${BOOKING_ID}`;

function params(source: "verify" | "webhook") {
  return {
    source,
    paystackReference: REF,
    amountCents: 50_000,
    currency: "ZAR",
    customerEmail: "prc-order@example.com",
    snapshot: null,
    paystackMetadata: { booking_id: BOOKING_ID },
    paystackAuthorizationCode: null,
    paystackCustomerCode: null,
    paidAtIso: "2026-07-16T00:00:00.000Z",
  };
}

describe("Princess PR C — callback/webhook ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A. callback-first then webhook: second call is skipped (no double settle)", async () => {
    upsertMock
      .mockResolvedValueOnce({
        ok: true,
        skipped: false,
        bookingId: BOOKING_ID,
        bookingInDatabase: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        skipped: true,
        bookingId: BOOKING_ID,
        bookingInDatabase: true,
      });

    const first = await finalizePaystackChargeSuccess(params("verify"));
    const second = await finalizePaystackChargeSuccess(params("webhook"));

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(vi.mocked(notifyBookingEvent)).toHaveBeenCalledTimes(2);
  });

  it("B. webhook-first then callback: second call is skipped (same final booking)", async () => {
    upsertMock
      .mockResolvedValueOnce({
        ok: true,
        skipped: false,
        bookingId: BOOKING_ID,
        bookingInDatabase: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        skipped: true,
        bookingId: BOOKING_ID,
        bookingInDatabase: true,
      });

    const first = await finalizePaystackChargeSuccess(params("webhook"));
    const second = await finalizePaystackChargeSuccess(params("verify"));

    expect(first.bookingId).toBe(BOOKING_ID);
    expect(second.bookingId).toBe(BOOKING_ID);
    expect(second.skipped).toBe(true);
  });

  it("parallel finalize for same reference remains reference-keyed", async () => {
    upsertMock.mockResolvedValue({
      ok: true,
      skipped: true,
      bookingId: BOOKING_ID,
      bookingInDatabase: true,
    });
    await Promise.all([
      finalizePaystackChargeSuccess(params("verify")),
      finalizePaystackChargeSuccess(params("webhook")),
    ]);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock.mock.calls.every((c) => c[0].paystackReference === REF)).toBe(true);
  });
});

describe("Princess PR C — currency / booking mismatch at finalize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces currency_mismatch without notifying", async () => {
    upsertMock.mockResolvedValue({
      ok: false,
      skipped: true,
      bookingId: BOOKING_ID,
      error: "currency_mismatch",
      reason: "currency_mismatch",
      bookingInDatabase: true,
      recoveryEnqueue: true,
    });
    const out = await finalizePaystackChargeSuccess({
      ...params("webhook"),
      currency: "USD",
    });
    expect(out.reason).toBe("currency_mismatch");
    expect(vi.mocked(notifyBookingEvent)).not.toHaveBeenCalled();
  });

  it("surfaces booking_mismatch without notifying", async () => {
    upsertMock.mockResolvedValue({
      ok: false,
      skipped: true,
      bookingId: BOOKING_ID,
      error: "booking_mismatch",
      reason: "booking_mismatch",
      bookingInDatabase: true,
    });
    const out = await finalizePaystackChargeSuccess(params("verify"));
    expect(out.reason).toBe("booking_mismatch");
    expect(vi.mocked(notifyBookingEvent)).not.toHaveBeenCalled();
  });
});
