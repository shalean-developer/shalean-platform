import { expect, test } from "@playwright/test";

const launchOn = process.env.E2E_LAUNCH === "1";
const customerJwt = process.env.E2E_CUSTOMER_SUPABASE_JWT?.trim() ?? "";
const adminJwt = process.env.E2E_ADMIN_SUPABASE_JWT?.trim() ?? "";

test.describe("Launch readiness — booking-v2", () => {
  test.beforeEach(() => {
    test.skip(!launchOn, "Set E2E_LAUNCH=1.");
  });

  test("booking entry loads /book service picker", async ({ page }) => {
    const response = await page.goto("/book", { waitUntil: "domcontentloaded" });
    expect(response?.status(), `navigation status was ${response?.status()}`).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("booking-v2 services API returns catalog", async ({ request }) => {
    const res = await request.get("/api/booking-v2/services");
    const text = await res.text();
    expect(res.status(), text.slice(0, 400)).toBe(200);
    const json = JSON.parse(text) as { catalog?: Record<string, unknown> };
    expect(json.catalog).toBeTruthy();
  });

  test("booking-v2 confirm requires auth", async ({ request }) => {
    const res = await request.post("/api/booking-v2/confirm", {
      headers: { "Content-Type": "application/json" },
      data: {
        serviceSlug: "regular-cleaning",
        serviceDetails: { bedrooms: 2, bathrooms: 1 },
        address: "1 Test Street",
        suburb: "Sea Point",
        contactPhone: "0821234567",
        bookingType: "once_off",
        date: "2026-12-15",
        time: "09:00",
        cleanerMode: "individual_cleaners",
        cleanerCount: 1,
        pricingSummary: { total: 500, estimated_total: 500 },
      },
    });
    expect(res.status()).toBe(401);
  });

  test("authenticated confirm creates pending_payment when customer JWT set", async ({ request }) => {
    test.skip(!customerJwt, "Set E2E_CUSTOMER_SUPABASE_JWT for confirm assertion.");

    const servicesRes = await request.get("/api/booking-v2/services");
    expect(servicesRes.ok()).toBeTruthy();
    const servicesBody = (await servicesRes.json()) as {
      catalog?: { "regular-cleaning"?: { basePrice?: number } };
    };
    const total = servicesBody.catalog?.["regular-cleaning"]?.basePrice ?? 450;

    const confirmRes = await request.post("/api/booking-v2/confirm", {
      headers: {
        Authorization: `Bearer ${customerJwt}`,
        "Content-Type": "application/json",
      },
      data: {
        serviceSlug: "regular-cleaning",
        serviceDetails: { bedrooms: 2, bathrooms: 1, extraRooms: 0 },
        address: "99 E2E Launch Street",
        suburb: "Sea Point",
        city: "Cape Town",
        postalCode: "8005",
        contactPhone: "0821234567",
        selectedExtras: [],
        bookingType: "once_off",
        date: "2026-12-20",
        time: "09:00",
        cleanerMode: "individual_cleaners",
        cleanerCount: 1,
        selectedCleanerIds: [],
        pricingSummary: { total, estimated_total: total },
      },
    });
    const confirmText = await confirmRes.text();
    expect(confirmRes.status(), confirmText.slice(0, 600)).toBe(200);
    const confirmJson = JSON.parse(confirmText) as { success?: boolean; bookingId?: string };
    expect(confirmJson.success).toBe(true);
    expect(confirmJson.bookingId).toMatch(/^[0-9a-f-]{36}$/i);

    test.skip(!adminJwt, "Set E2E_ADMIN_SUPABASE_JWT to verify admin can read pending_payment booking.");

    const adminRes = await request.get(
      `/api/admin/bookings/${encodeURIComponent(String(confirmJson.bookingId))}`,
      { headers: { Authorization: `Bearer ${adminJwt}` } },
    );
    expect(adminRes.status(), await adminRes.text()).toBe(200);
    const adminBody = (await adminRes.json()) as { booking?: { status?: string; booking_reference?: string } };
    expect(String(adminBody.booking?.status ?? "").toLowerCase()).toBe("pending_payment");
    expect(String(adminBody.booking?.booking_reference ?? "")).toMatch(/^SHL-BK-/i);
  });
});
