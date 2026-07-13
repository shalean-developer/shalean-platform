import { describe, expect, it, vi, beforeEach } from "vitest";
import { settleFullyCoveredBooking } from "@/lib/payments/settleFullyCoveredBooking";

describe("settleFullyCoveredBooking", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects non-zero pay amounts as not R0", async () => {
    const admin = { rpc: vi.fn() };
    const result = await settleFullyCoveredBooking(admin as never, {
      bookingId: "00000000-0000-4000-8000-000000000001",
      payAmountZar: 10,
    });
    expect(result).toEqual({ ok: false, error: "not_fully_covered", code: "not_r0" });
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("uses RPC success path and records already_settled", async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            ok: true,
            error_message: null,
            payment_transaction_id: "tx-1",
            already_settled: true,
          },
        ],
        error: null,
      }),
    };
    const result = await settleFullyCoveredBooking(admin as never, {
      bookingId: "00000000-0000-4000-8000-000000000001",
      payAmountZar: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.paymentTransactionId).toBe("tx-1");
      expect(result.alreadySettled).toBe(true);
    }
  });

  it("fallback refuses positive total_price (matches RPC not_fully_covered)", async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Could not find the function settle_booking_fully_covered", code: "PGRST202" },
      }),
      from: vi.fn((table: string) => {
        if (table === "bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "00000000-0000-4000-8000-000000000001",
                    status: "pending_payment",
                    payment_status: "pending",
                    total_price: 250,
                    payment_transaction_id: null,
                    payment_completed_at: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };
    const result = await settleFullyCoveredBooking(admin as never, {
      bookingId: "00000000-0000-4000-8000-000000000001",
      payAmountZar: 0,
    });
    expect(result).toEqual({ ok: false, error: "not_fully_covered", code: "not_r0" });
  });

  it("propagates RPC persistence failures", async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({
        data: [{ ok: false, error_message: "booking_not_found", payment_transaction_id: null }],
        error: null,
      }),
    };
    const result = await settleFullyCoveredBooking(admin as never, {
      bookingId: "00000000-0000-4000-8000-000000000001",
      payAmountZar: 0,
    });
    expect(result).toEqual({
      ok: false,
      error: "booking_not_found",
      code: "persist_failed",
    });
  });

  it("falls back when RPC is missing and fails when booking update errors", async () => {
    const updateEq = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "bookings_paid_requires_amount" },
        }),
      }),
    });
    const admin = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Could not find the function settle_booking_fully_covered", code: "PGRST202" },
      }),
      from: vi.fn((table: string) => {
        if (table === "bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "00000000-0000-4000-8000-000000000001",
                    status: "pending_payment",
                    payment_status: "pending",
                    total_price: 0,
                    payment_transaction_id: null,
                    payment_completed_at: null,
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: updateEq }),
          };
        }
        if (table === "payment_transactions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "tx-fallback" }, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const result = await settleFullyCoveredBooking(admin as never, {
      bookingId: "00000000-0000-4000-8000-000000000001",
      payAmountZar: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("persist_failed");
    }
  });
});
