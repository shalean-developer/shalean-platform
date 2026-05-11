import { describe, expect, it } from "vitest";
import { evaluateBookingPaymentPrecheck } from "@/lib/booking/bookingPaymentPrecheckLogic";

describe("evaluateBookingPaymentPrecheck", () => {
  const base = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "pending_payment" as const,
    total_price: 500,
    payment_completed_at: null as string | null,
  };

  it("accepts matching pending_payment row", () => {
    expect(evaluateBookingPaymentPrecheck(base, 500)).toEqual({ ok: true });
    expect(evaluateBookingPaymentPrecheck(base, 501)).toEqual({ ok: true });
    expect(evaluateBookingPaymentPrecheck(base, 499)).toEqual({ ok: true });
  });

  it("rejects missing row", () => {
    const out = evaluateBookingPaymentPrecheck(null, 500);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("not_found");
  });

  it("rejects wrong status", () => {
    const out = evaluateBookingPaymentPrecheck({ ...base, status: "paid" }, 500);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("wrong_status");
  });

  it("rejects total mismatch beyond epsilon", () => {
    const out = evaluateBookingPaymentPrecheck({ ...base, total_price: 100 }, 500);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("total_mismatch");
  });
});
