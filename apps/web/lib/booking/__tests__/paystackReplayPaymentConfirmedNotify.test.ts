import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/notifications/notifyBookingEvent", () => ({
  notifyBookingEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

import { replayPaymentConfirmedNotifyForPersistedBooking } from "@/lib/booking/paystackReplayPaymentConfirmedNotify";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";

describe("replayPaymentConfirmedNotifyForPersistedBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes notifyBookingEvent with payment_reference for idempotent replay", async () => {
    const supabase = {} as never;
    await replayPaymentConfirmedNotifyForPersistedBooking({
      supabase,
      bookingId: "00000000-0000-4000-8000-000000000099",
      paystackReference: "pay_ref_xyz",
      amountCents: 5000,
      metadata: { customer_email: "payer@example.com" },
      snapshot: null,
    });
    expect(notifyBookingEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyBookingEvent).mock.calls[0]?.[0]).toMatchObject({
      type: "payment_confirmed",
      bookingId: "00000000-0000-4000-8000-000000000099",
      paymentReference: "pay_ref_xyz",
      amountCents: 5000,
    });
  });
});
