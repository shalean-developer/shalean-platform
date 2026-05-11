import crypto from "crypto";
import { test, expect } from "@playwright/test";
import { isPaystackDecoupledReference } from "./helpers";

/**
 * Signed webhook replay against an already-finalized sandbox transaction (Gap 3 optional).
 *
 * Uses the same HMAC algorithm as `app/api/paystack/webhook/route.ts` (SHA512 + PAYSTACK_SECRET_KEY).
 * Only runs when explicitly enabled — requires secret in the test process environment.
 */
const paystackEnabled = process.env.E2E_PAYSTACK === "1";
const webhookReplay = process.env.E2E_PAYSTACK_WEBHOOK_REPLAY === "1";
const verifyReference = process.env.E2E_PAYSTACK_VERIFY_REFERENCE?.trim() ?? "";
const secret = process.env.PAYSTACK_SECRET_KEY?.trim() ?? "";

function signPaystackWebhookBody(rawBody: string): string {
  return crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
}

test.describe.configure({ mode: "serial" });

test.describe("POST /api/paystack/webhook idempotent replay", () => {
  test.beforeEach(() => {
    test.skip(!paystackEnabled, "Set E2E_PAYSTACK=1 to enable Paystack E2E.");
    test.skip(!webhookReplay, "Set E2E_PAYSTACK_WEBHOOK_REPLAY=1 to enable signed webhook replay.");
    test.skip(!verifyReference, "Set E2E_PAYSTACK_VERIFY_REFERENCE.");
    test.skip(!secret.startsWith("sk_test"), "PAYSTACK_SECRET_KEY must be a test secret for webhook replay.");
  });

  test("charge.success replay is accepted twice without requiring duplicate finalize", async ({ request }) => {
    const warm = await request.post("/api/paystack/verify", {
      data: { reference: verifyReference },
    });
    expect(warm.status(), await warm.text()).toBe(200);
    const warmBody = (await warm.json()) as Record<string, unknown>;
    expect(warmBody.success).toBe(true);
    const bookingId = typeof warmBody.bookingId === "string" ? warmBody.bookingId : null;
    expect(bookingId).toBeTruthy();
    const amountCents =
      typeof warmBody.amountCents === "number" && Number.isFinite(warmBody.amountCents)
        ? warmBody.amountCents
        : 0;
    expect(amountCents).toBeGreaterThan(0);

    const customerEmail =
      typeof warmBody.customerEmail === "string" && warmBody.customerEmail.includes("@")
        ? warmBody.customerEmail
        : "e2e-webhook@example.com";

    const metadata: Record<string, string> = {};
    if (bookingId && isPaystackDecoupledReference(verifyReference)) {
      metadata.booking_id = bookingId;
    }

    const payload = {
      event: "charge.success",
      data: {
        reference: verifyReference,
        amount: amountCents,
        currency: "ZAR",
        status: "success",
        paid_at: new Date().toISOString(),
        customer: { email: customerEmail },
        metadata,
      },
    };
    const rawBody = JSON.stringify(payload);
    const signature = signPaystackWebhookBody(rawBody);

    const res1 = await request.post("/api/paystack/webhook", {
      data: rawBody,
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": signature,
      },
    });
    expect(res1.status(), await res1.text()).toBe(200);

    const res2 = await request.post("/api/paystack/webhook", {
      data: rawBody,
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": signature,
      },
    });
    expect(res2.status(), await res2.text()).toBe(200);
  });
});
