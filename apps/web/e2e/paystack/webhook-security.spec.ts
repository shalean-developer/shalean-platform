import { test, expect } from "@playwright/test";

/** Invalid webhook signature must be rejected without touching happy-path finalize logic. */
const paystackEnabled = process.env.E2E_PAYSTACK === "1";

test.describe("POST /api/paystack/webhook signature", () => {
  test.beforeEach(() => {
    test.skip(!paystackEnabled, "Set E2E_PAYSTACK=1 to enable Paystack E2E.");
  });

  test("rejects invalid x-paystack-signature with 401", async ({ request }) => {
    const payload = {
      event: "charge.success",
      data: {
        reference: "e2e_invalid_sig_stub",
        amount: 100_00,
        currency: "ZAR",
        status: "success",
        paid_at: new Date().toISOString(),
        customer: { email: "e2e-invalid-sig@example.com" },
        metadata: {},
      },
    };
    const rawBody = JSON.stringify(payload);
    const res = await request.post("/api/paystack/webhook", {
      body: rawBody,
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": "deadbeef_invalid_hmac",
      },
    });
    if (res.status() === 503) {
      test.skip(true, "Server Paystack not configured — set PAYSTACK_SECRET_KEY on the app under PLAYWRIGHT_BASE_URL.");
    }
    expect(res.status()).toBe(401);
  });
});
