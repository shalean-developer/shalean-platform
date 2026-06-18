import { test, expect } from "@playwright/test";

const launchOn = process.env.E2E_LAUNCH === "1";
const paystackOn = process.env.E2E_PAYSTACK === "1";
const verifyReference = process.env.E2E_PAYSTACK_VERIFY_REFERENCE?.trim() ?? "";

test.describe("Launch readiness — Paystack (opt-in)", () => {
  test.beforeEach(() => {
    test.skip(!launchOn, "Set E2E_LAUNCH=1.");
    test.skip(!paystackOn, "Set E2E_PAYSTACK=1.");
    test.skip(!verifyReference, "Set E2E_PAYSTACK_VERIFY_REFERENCE (see e2e/paystack/README.md).");
  });

  test("paystack verify endpoint is reachable for a known reference", async ({ request }) => {
    const res = await request.post("/api/paystack/verify", {
      headers: { "Content-Type": "application/json" },
      data: { reference: verifyReference },
    });
    const text = await res.text();
    expect([200, 404, 409, 422]).toContain(res.status());
    const json = JSON.parse(text) as { ok?: boolean; error?: string };
    expect(json).toBeTruthy();
    if (res.status() === 200) {
      expect(json.ok).toBe(true);
    }
  });
});
