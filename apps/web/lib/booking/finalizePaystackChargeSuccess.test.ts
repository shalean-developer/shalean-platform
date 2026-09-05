
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reportPaidBookingAdsConversions } from "@/lib/ads/reportPaidBookingAdsConversions";
import { notifyOfficeSoftFulfillment } from "@/lib/notifications/notifyOfficeSoftFulfillment";
vi.mock("@/lib/ads/reportPaidBookingAdsConversions", () => ({ reportPaidBookingAdsConversions: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/notifications/notifyOfficeSoftFulfillment", () => ({ notifyOfficeSoftFulfillment: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/referrals/referralCheckoutMetadata", () => ({
  enrichPaystackMetadataWithBookingReferral: vi.fn(async (_admin, _id, metadata) => metadata),
}));
import { recordReferralCheckoutRedemption } from "@/lib/referrals/validateReferral";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";
import { describe, expect, it, vi, beforeEach } from "vitest";

const upsertMock = vi.hoisted(() => vi.fn());

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

describe("finalizePaystackChargeSuccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("double finalize (verify + verify) invokes upsert twice without throwing", async () => {
    upsertMock.mockResolvedValue({
      ok: true,
      skipped: true,
      bookingId: "00000000-0000-4000-8000-000000000099",
      bookingInDatabase: true,
    });
    const params = {
      source: "verify" as const,
      paystackReference: "dup-ref",
      amountCents: 5000,
      currency: "ZAR",
      customerEmail: "payer@example.com",
      snapshot: null,
      paystackMetadata: {},
      paystackAuthorizationCode: null,
      paystackCustomerCode: null,
      paidAtIso: null,
    };
    await Promise.all([finalizePaystackChargeSuccess(params), finalizePaystackChargeSuccess(params)]);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(vi.mocked(notifyBookingEvent)).toHaveBeenCalledTimes(2);
  });

  it("surfaces amount_mismatch from upsert", async () => {
    upsertMock.mockResolvedValue({
      ok: false,
      skipped: true,
      bookingId: "00000000-0000-4000-8000-000000000088",
      error: "amount_mismatch",
      reason: "amount_mismatch",
      bookingInDatabase: true,
    });
    const out = await finalizePaystackChargeSuccess({
      source: "webhook",
      paystackReference: "mis",
      amountCents: 1,
      currency: "ZAR",
      customerEmail: "payer@example.com",
      snapshot: null,
      paystackMetadata: {},
      paystackAuthorizationCode: null,
      paystackCustomerCode: null,
      paidAtIso: null,
    });
    expect(out.reason).toBe("amount_mismatch");
    expect(vi.mocked(notifyBookingEvent)).not.toHaveBeenCalled();
  });
});

describe("Slice 2 conflict boundary before external success effects", () => {
  it.each(["PAYMENT_CUSTOMER_IDENTITY_MISMATCH", "PAYMENT_FINALIZATION_CONFLICT"])(
    "preserves %s without referral redemption, notification or recovery enqueue", async (code) => {
      vi.clearAllMocks();
      upsertMock.mockResolvedValue({
        ok: false, skipped: true, bookingId: "00000000-0000-4000-8000-000000000088",
        bookingInDatabase: true, code, error: "Pending booking finalization rejected.",
      });
      const out = await finalizePaystackChargeSuccess({
        source: "webhook", paystackReference: "pay_conflict", amountCents: 12550,
        currency: "ZAR", customerEmail: "payer@example.com", snapshot: null,
        paystackMetadata: {}, paystackAuthorizationCode: null, paystackCustomerCode: null, paidAtIso: null,
      });
      expect(out).toMatchObject({ ok: false, code });
      expect(notifyBookingEvent).not.toHaveBeenCalled();
      expect(recordReferralCheckoutRedemption).not.toHaveBeenCalled();
      expect(enqueueFailedJob).not.toHaveBeenCalled();
    },
  );
});


describe("Slice 2B outer replay success-effect gate", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const params = {
    source: "retry" as const, paystackReference: "pay_current", amountCents: 12550, currency: "ZAR",
    customerEmail: "current@example.com", snapshot: null, paystackMetadata: {},
    paystackAuthorizationCode: null, paystackCustomerCode: null, paidAtIso: null,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockReset();
    // Only the outer finalizer's read-only soft-fulfillment lookup is needed here.
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: () => ({
        select: (columns: string) => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: columns.startsWith("fulfillment_mode") ? { fulfillment_mode: "ops_assignment" } : null,
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof getSupabaseAdmin>);
  });
  function noSuccessEffects() {
    expect(recordReferralCheckoutRedemption).not.toHaveBeenCalled();
    expect(notifyBookingEvent).not.toHaveBeenCalled();
    expect(reportPaidBookingAdsConversions).not.toHaveBeenCalled();
    expect(notifyOfficeSoftFulfillment).not.toHaveBeenCalled();
    expect(enqueueFailedJob).not.toHaveBeenCalled();
  }
  it("returns replay mismatch unchanged and blocks every exposed success effect", async () => {
    const mismatch = {
      ok: false, skipped: true, bookingId: id, bookingInDatabase: true,
      error: "PAYMENT_FINALIZATION_REPLAY_MISMATCH", code: "PAYMENT_FINALIZATION_REPLAY_MISMATCH",
    };
    upsertMock.mockResolvedValue(mismatch);
    expect(await finalizePaystackChargeSuccess(params)).toEqual(mismatch);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    noSuccessEffects();
  });
  it("preserves equivalent replay and existing idempotent effects", async () => {
    upsertMock.mockResolvedValue({ ok: true, skipped: true, bookingId: id, bookingInDatabase: true });
    expect(await finalizePaystackChargeSuccess(params)).toMatchObject({ ok: true, skipped: true, bookingId: id });
    expect(recordReferralCheckoutRedemption).toHaveBeenCalledTimes(1);
    expect(notifyBookingEvent).toHaveBeenCalledTimes(1);
    expect(reportPaidBookingAdsConversions).toHaveBeenCalledTimes(1);
    expect(notifyOfficeSoftFulfillment).toHaveBeenCalledTimes(1);
    expect(enqueueFailedJob).not.toHaveBeenCalled();
  });
  it("requires explicit ok true even if a failed result has no error string", async () => {
    upsertMock.mockResolvedValue({ ok: false, skipped: true, bookingId: id, bookingInDatabase: true });
    await finalizePaystackChargeSuccess(params);
    noSuccessEffects();
  });
});
