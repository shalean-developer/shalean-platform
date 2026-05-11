import { test, expect } from "@playwright/test";

/**
 * Paystack verify fallback + idempotency (Gap 3).
 *
 * Requires a transaction that already succeeded in Paystack test mode.
 * Set `E2E_PAYSTACK_VERIFY_REFERENCE` to that reference after a manual (or automated) test payment.
 */
const paystackEnabled = process.env.E2E_PAYSTACK === "1";
const verifyReference = process.env.E2E_PAYSTACK_VERIFY_REFERENCE?.trim() ?? "";

test.describe("POST /api/paystack/verify idempotency", () => {
  test.beforeEach(() => {
    test.skip(!paystackEnabled, "Set E2E_PAYSTACK=1 to enable Paystack E2E.");
    test.skip(!verifyReference, "Set E2E_PAYSTACK_VERIFY_REFERENCE to a successful sandbox transaction reference.");
  });

  test("second verify does not create a divergent booking outcome", async ({ request }) => {
    const res1 = await request.post("/api/paystack/verify", {
      data: { reference: verifyReference },
    });
    expect(res1.status(), await res1.text()).toBe(200);
    const body1 = (await res1.json()) as Record<string, unknown>;
    expect(body1.success).toBe(true);
    expect(body1.paymentStatus).toBe("success");

    const bookingId =
      typeof body1.bookingId === "string" && body1.bookingId.length > 0 ? body1.bookingId : null;
    expect(bookingId, "Expected finalized booking id from verify response").toBeTruthy();

    const res2 = await request.post("/api/paystack/verify", {
      data: { reference: verifyReference },
    });
    expect(res2.status(), await res2.text()).toBe(200);
    const body2 = (await res2.json()) as Record<string, unknown>;
    expect(body2.success).toBe(true);
    expect(body2.paymentStatus).toBe("success");
    expect(body2.bookingId).toBe(bookingId);

    const idempotent =
      body2.skipped === true ||
      body2.alreadyExists === true ||
      body2.state === "already_processed";
    expect(idempotent, JSON.stringify(body2)).toBe(true);
  });
});
