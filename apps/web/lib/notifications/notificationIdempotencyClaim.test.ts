import { describe, expect, it, vi } from "vitest";
import { tryClaimNotificationIdempotency } from "@/lib/notifications/notificationIdempotencyClaim";

vi.mock("@/lib/observability/paymentStructuredLog", () => ({
  logPaymentStructured: vi.fn(),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

describe("tryClaimNotificationIdempotency", () => {
  it("returns false on duplicate (23505)", async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => Promise.resolve({ error: { code: "23505", message: "dup" } })),
      })),
    };
    const ok = await tryClaimNotificationIdempotency(supabase as never, {
      reference: "paystack-ref-1",
      eventType: "payment_confirmed",
      channel: "email",
      bookingId: "b1",
    });
    expect(ok).toBe(false);
  });

  it("returns false on other DB errors (fail closed)", async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => Promise.resolve({ error: { code: "42P01", message: "missing table" } })),
      })),
    };
    const ok = await tryClaimNotificationIdempotency(supabase as never, {
      reference: "paystack-ref-1",
      eventType: "payment_confirmed",
      channel: "email",
    });
    expect(ok).toBe(false);
  });

  it("returns true on successful insert", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = {
      from: vi.fn(() => ({
        insert,
      })),
    };
    const ok = await tryClaimNotificationIdempotency(supabase as never, {
      reference: " paystack-ref-xyz ",
      eventType: "payment_confirmed",
      channel: "email",
      bookingId: "b1",
    });
    expect(ok).toBe(true);
    expect(insert).toHaveBeenCalledWith({
      reference: "paystack-ref-xyz",
      event_type: "payment_confirmed",
      channel: "email",
      booking_id: "b1",
    });
  });

  it("returns true without insert when reference missing (fail-open)", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = {
      from: vi.fn(() => ({
        insert,
      })),
    };
    const ok = await tryClaimNotificationIdempotency(supabase as never, {
      reference: "   ",
      eventType: "payment_confirmed",
      channel: "email",
    });
    expect(ok).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });
});
