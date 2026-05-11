import { test, expect } from "@playwright/test";
import { buildLockedBookingFromLockResponse, futureDateYmd, type LockApiOk } from "./helpers";

/**
 * Lock → initialize creates `pending_payment` + Paystack `authorization_url` (Gap 3).
 * Completing payment is manual unless you add browser automation (`E2E_PAYSTACK_BROWSER_PAY` — not implemented here).
 */
const paystackEnabled = process.env.E2E_PAYSTACK === "1";
const fullCheckout = process.env.E2E_PAYSTACK_FULL === "1";

test.describe("POST /api/paystack/initialize (lock merge)", () => {
  test.beforeEach(() => {
    test.skip(!paystackEnabled, "Set E2E_PAYSTACK=1 to enable Paystack E2E.");
    test.skip(!fullCheckout, "Set E2E_PAYSTACK_FULL=1 to run lock → initialize checkout smoke.");
  });

  test("returns authorizationUrl and reference after lock", async ({ request }) => {
    const lockBody = {
      service: "standard",
      service_type: "standard_cleaning",
      rooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: [] as string[],
      time: "10:00",
      vipTier: "regular",
    };

    const lockRes = await request.post("/api/booking/lock", { data: lockBody });
    expect(lockRes.ok, await lockRes.text()).toBeTruthy();
    const lockJson = (await lockRes.json()) as LockApiOk & { ok?: boolean; error?: string };
    expect(lockJson.ok, JSON.stringify(lockJson)).toBe(true);

    const locked = buildLockedBookingFromLockResponse(lockJson as LockApiOk, {
      date: futureDateYmd(7),
      timeHm: "10:00",
      location: "E2E Paystack initialize smoke",
      serviceSlug: "standard",
      serviceTypeSlug: "standard_cleaning",
      rooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: [],
    });

    const email = "e2e-paystack-init@example.com";
    const initRes = await request.post("/api/paystack/initialize", {
      data: {
        locked,
        email,
        customer: { name: "E2E Paystack", email, phone: "+27821234567" },
      },
    });
    expect(initRes.ok, await initRes.text()).toBeTruthy();
    const initJson = (await initRes.json()) as {
      authorizationUrl?: string;
      reference?: string;
      bookingId?: string;
      error?: string;
    };
    expect(initJson.error, JSON.stringify(initJson)).toBeUndefined();
    expect(typeof initJson.authorizationUrl).toBe("string");
    expect(initJson.authorizationUrl).toMatch(/^https:\/\//);
    expect(typeof initJson.reference).toBe("string");
    expect(initJson.reference!.length).toBeGreaterThan(3);
    expect(typeof initJson.bookingId).toBe("string");
  });
});
