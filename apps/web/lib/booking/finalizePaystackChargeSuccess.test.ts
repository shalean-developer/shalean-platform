import { describe, expect, it, vi, beforeEach } from "vitest";

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
  });
});
