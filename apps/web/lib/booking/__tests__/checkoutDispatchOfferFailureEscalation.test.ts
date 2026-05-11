import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUpdateChain = vi.fn();

vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ops/dispatchControlWebhook", () => ({
  postDispatchControlAlert: vi.fn().mockResolvedValue(undefined),
}));

import { escalateFailedCheckoutDispatchOffer } from "@/lib/booking/checkoutDispatchOfferFailureEscalation";
import { metrics } from "@/lib/metrics/counters";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { postDispatchControlAlert } from "@/lib/ops/dispatchControlWebhook";

describe("escalateFailedCheckoutDispatchOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateChain.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it("increments metric, logs, alerts, and flags payment_needs_follow_up", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: mockUpdateChain,
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    await escalateFailedCheckoutDispatchOffer({
      supabase,
      bookingId: "00000000-0000-4000-8000-0000000000aa",
      paystackReference: "pay_ref_1",
      cleanerId: "00000000-0000-4000-8000-0000000000bb",
      offerError: "Insert dispatch_offers failed.",
    });

    expect(metrics.increment).toHaveBeenCalledWith(
      "booking.checkout_dispatch_offer_insert_failed",
      expect.objectContaining({
        bookingId: "00000000-0000-4000-8000-0000000000aa",
        cleanerId: "00000000-0000-4000-8000-0000000000bb",
        reference: "pay_ref_1",
      }),
    );
    expect(reportOperationalIssue).toHaveBeenCalled();
    expect(logSystemEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "checkout_dispatch_offer_insert",
        level: "warn",
      }),
    );
    expect(postDispatchControlAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        errorType: "checkout_dispatch_offer_insert_failed",
        bookingId: "00000000-0000-4000-8000-0000000000aa",
        dedupeKey: "checkout_offer_failed:00000000-0000-4000-8000-0000000000aa",
      }),
      expect.any(Object),
    );
    expect(supabase.from).toHaveBeenCalledWith("bookings");
    expect(mockUpdateChain).toHaveBeenCalledWith({ payment_needs_follow_up: true });
  });
});
