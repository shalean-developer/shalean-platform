import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  ensure: vi.fn(),
  serviceWrites: vi.fn(),
}));

vi.mock("@/lib/supabase/bookingRouteBearerAuth", () => ({
  resolveBookingRouteBearerAuth: mocks.auth,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.serviceWrites }),
}));
vi.mock("@/lib/booking/ensureBookingPaymentSession", () => ({
  ensureBookingPaymentSession: mocks.ensure,
}));
vi.mock("@/lib/rateLimit/paystackInitializeAbuseLimit", () => ({
  checkPaystackInitializeIpLimit: () => ({ allowed: true }),
  checkPaystackInitializeBodyLimits: () => ({ allowed: true }),
}));
vi.mock("@/lib/booking/freshPaymentPreparationToken", () => ({
  verifyFreshPaymentPreparationToken: () => false,
}));

import { POST } from "@/app/api/bookings/[id]/payment-session/route";

const bookingId = "33333333-3333-4333-8333-333333333333";
const ownerId = "44444444-4444-4444-8444-444444444444";
const url = "https://checkout.paystack.com/synthetic-existing-link";

async function recover(reference = "") {
  const res = await POST(
    new Request("http://localhost/api/bookings/" + bookingId + "/payment-session", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token" },
      body: JSON.stringify(reference ? { reference } : {}),
    }),
    { params: Promise.resolve({ id: bookingId }) },
  );
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ kind: "authenticated", userId: ownerId, email: "synthetic@example.invalid" });
  mocks.ensure.mockResolvedValue({
    status: "ready", bookingId, reference: "original-ref", authorizationUrl: url,
    reused: true, refreshed: false, amountZar: 600,
  });
});

describe("FCO-01 authenticated pending-payment HTTP recovery", () => {
  it("retries the original booking twice without creating a second booking or reference", async () => {
    const first = await recover();
    const second = await recover();
    for (const result of [first, second]) {
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        status: "ready", bookingId, reference: "original-ref", authorizationUrl: url,
        reused: true, refreshed: false,
      });
      expect(result.body).not.toHaveProperty("amountZar"); // no draft price from browser
    }
    expect(mocks.ensure).toHaveBeenCalledTimes(2);
    expect(mocks.ensure).toHaveBeenNthCalledWith(1, expect.anything(), {
      bookingId, access: { kind: "owner", userId: ownerId }, freshAttempt: false,
    });
    expect(mocks.ensure).toHaveBeenNthCalledWith(2, expect.anything(), {
      bookingId, access: { kind: "owner", userId: ownerId }, freshAttempt: false,
    });
    expect(mocks.serviceWrites).not.toHaveBeenCalled();
  });

  it("refuses unauthenticated retry without invoking payment-session preparation", async () => {
    mocks.auth.mockResolvedValue({ kind: "anonymous" });
    const result = await recover();
    expect(result.status).toBe(401);
    expect(result.body.errorCode).toBe("PAYMENT_ACCESS_DENIED");
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it("returns a paid state without re-opening a new payment session", async () => {
    mocks.ensure.mockResolvedValue({
      status: "paid", bookingId, reference: "original-ref",
    });
    const result = await recover();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "paid", bookingId, reference: "original-ref" });
    expect(result.body).not.toHaveProperty("authorizationUrl");
  });

  it("keeps failed retry as failed, with no automatic fallback booking", async () => {
    mocks.ensure.mockResolvedValue({
      status: "failed", bookingId,
      errorCode: "PAYMENT_INITIALIZATION_FAILED",
      error: "Payment unavailable", retryable: true,
    });
    const result = await recover();
    expect(result.body).toMatchObject({
      status: "failed", bookingId, errorCode: "PAYMENT_INITIALIZATION_FAILED", retryable: true,
    });
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
    expect(mocks.serviceWrites).not.toHaveBeenCalled();
  });
});
