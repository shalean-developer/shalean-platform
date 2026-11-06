import { expect, test, type Page } from "@playwright/test";

const KEY = "shalean:booking-v2:v1";
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const CITY_ID = "22222222-2222-4222-8222-222222222222";
const address1 = "21 Synthetic Test Street";
const address2 = "22 Synthetic Test Street";

function sampleDraft(equipmentRequired: "yes" | "no" = "yes") {
  return {
    serviceSlug: "regular-cleaning",
    serviceDetails: {
      propertyType: "house", bedrooms: "2", bathrooms: "1", extraRooms: "0",
      hasPets: "no", lastCleaned: "1_3_months",
    },
    address: address1, suburb: "Claremont", city: "Cape Town", postalCode: "7708",
    serviceAreaLocationId: LOCATION_ID, serviceAreaCityId: CITY_ID,
    contactPhone: "0821234567", equipmentRequired, equipmentQuote: null,
    bookingType: "once_off", date: "2026-12-15", time: "08:30",
    recurringFrequency: "", recurringDays: [], recurringStartDate: "", recurringEndDate: "",
    cleanerMode: "individual_cleaners", cleanerCount: 1,
    selectedCleanerIds: [], selectedCleanerDetails: [], selectedExtras: [],
    assignedTeamId: "", assignedTeamName: "",
    pendingBookingId: null,
  };
}

async function seed(page: Page, draft: Record<string, unknown>) {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: KEY, value: draft });
}

async function saved(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), KEY);
}

async function sandbox(page: Page) {
  const blocked: string[] = [];
  const equipmentRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/analytics/")) return route.fulfill({ status: 204, body: "" });
    if (path === "/api/booking-v2/quote" && req.method() === "POST") {
      return route.fulfill({ status: 200, json: {
        pricingSummary: { total: 850, estimated_total: 850, quote_signature: "test-lock-only",
          estimated_duration_minutes: 180, lineItems: [] },
        quoteLock: { pricingVersionId: LOCATION_ID, quoteSignature: "test-lock-only",
          lockedAt: "2026-11-06T00:00:00.000Z", expiresAt: "2099-12-31T00:00:00.000Z" },
      } });
    }
    if (path === "/api/booking-v2/equipment-quote" && req.method() === "POST") {
      const data = req.postDataJSON() as { address: string };
      equipmentRequests.push(data.address);
      const fee = data.address === address2 ? 750 : 600;
      return route.fulfill({ status: 200, json: { quote: {
        distance_km: 6, base_fee: 450, price_per_km: 25,
        distance_charge: fee - 450, logistics_fee: fee, base_location: "Synthetic equipment base",
        manual_quote_required: false, manual_quote_message: "",
        authorityReceipt: "synthetic-isolated-receipt",
      } } });
    }
    if (req.method() !== "GET") {
      blocked.push(req.method() + " " + path);
      return route.abort("blockedbyclient");
    }
    if (path === "/api/booking-v2/services") {
      return route.fulfill({ status: 200, json: { catalog: {}, scheduling: {
        leadMinutes: 0, slotStartHour: 8, slotEndHour: 12,
        slotIntervalMinutes: 30, timezone: "Africa/Johannesburg",
      } } });
    }
    if (path === "/api/booking/service-locations") {
      return route.fulfill({ status: 200, json: { ok: true, locations: [
        { id: LOCATION_ID, city_id: CITY_ID, name: "Claremont", city: "Cape Town" },
      ] } });
    }
    if (path === "/api/booking/time-slots") {
      return route.fulfill({ status: 200, json: { slots: [
        { time: "08:30", available: true, availableInstant: true, fulfillmentMode: "instant" },
      ] } });
    }
    return route.fulfill({ status: 404, json: { error: "isolated_e2e_unmocked:" + path } });
  });
  return { blocked, equipmentRequests };
}

test("FCO-01 Your Details: address change invalidates previous equipment delivery amount", async ({ page }) => {
  await seed(page, sampleDraft());
  const events = await sandbox(page);
  await page.goto("/book/regular-cleaning?step=review", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible();
  await expect.poll(async () => (await saved(page)).equipmentQuote as unknown).not.toBeNull();
  await expect.poll(async () => (await saved(page)).equipmentQuote && 
    ((await saved(page)).equipmentQuote as { logistics_fee: number }).logistics_fee).toBe(600);

  await page.locator("#address").fill(address2);
  // An older address quote is never eligible after an edit.
  await expect.poll(async () => {
    const q = (await saved(page)).equipmentQuote as { logistics_fee: number } | null;
    return q?.logistics_fee ?? null;
  }).toBe(750);
  expect(events.equipmentRequests).toContain(address1);
  expect(events.equipmentRequests).toContain(address2);
  expect(events.blocked).toEqual([]);
});

test("FCO-01 Your Details: manual/unavailable equipment must not enter payment", async ({ page }) => {
  await seed(page, sampleDraft());
  const result = await sandbox(page);
  await page.route("**/api/booking-v2/equipment-quote", (route) => route.fulfill({
    status: 409,
    json: { error: "Equipment delivery requires a manual quotation.", code: "EQUIPMENT_MANUAL_QUOTE_REQUIRED" },
  }));
  await page.goto("/book/regular-cleaning?step=review", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(page.getByText(/Equipment delivery must be priced for your full address/)).toBeVisible();
  await page.getByRole("button", { name: /Proceed to payment/ }).click();
  await expect(page).toHaveURL(/step=review/);
  expect(result.blocked).toEqual([]);
});

test("FCO-01 frozen pending payment: missing fresh equipment receipt does not force a new confirmation", async ({ page }) => {
  const draft = { ...sampleDraft(), pendingBookingId: "33333333-3333-4333-8333-333333333333" };
  await seed(page, draft);
  const result = await sandbox(page);
  await page.goto("/book/regular-cleaning?step=payment", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/step=payment/);
  // The canonical payment-summary endpoint is read-only and may be denied in
  // this synthetic run; it must never submit a fresh booking or payment POST.
  expect(result.blocked).toEqual([]);
});
