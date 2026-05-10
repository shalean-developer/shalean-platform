import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/recurring/refreshRecurringPaymentStateForBooking", () => ({
  refreshRecurringPaymentStateForBooking: vi.fn().mockResolvedValue(undefined),
}));

import { refreshRecurringPaymentStateForBooking } from "@/lib/recurring/refreshRecurringPaymentStateForBooking";
import { refreshRecurringBookingPaymentState } from "@/lib/booking/bookingOperations";

const admin = {} as SupabaseClient;

describe("refreshRecurringBookingPaymentState", () => {
  beforeEach(() => {
    vi.mocked(refreshRecurringPaymentStateForBooking).mockClear();
  });

  it("delegates to refreshRecurringPaymentStateForBooking with (admin, bookingId)", async () => {
    await refreshRecurringBookingPaymentState({ admin, bookingId: "bk_1" });
    expect(refreshRecurringPaymentStateForBooking).toHaveBeenCalledTimes(1);
    expect(refreshRecurringPaymentStateForBooking).toHaveBeenCalledWith(admin, "bk_1");
  });

  it("returns void when delegate resolves", async () => {
    const out = await refreshRecurringBookingPaymentState({ admin, bookingId: "bk_2" });
    expect(out).toBe(undefined);
  });

  it("propagates delegate rejection", async () => {
    vi.mocked(refreshRecurringPaymentStateForBooking).mockRejectedValueOnce(new Error("db"));
    await expect(refreshRecurringBookingPaymentState({ admin, bookingId: "bk_3" })).rejects.toThrow("db");
  });
});
