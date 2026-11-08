import { expect, test, type Page } from "@playwright/test";
import { SERVICE_CONFIG } from "../../src/features/booking-v2/config/serviceConfig";

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
          estimated_duration_minutes: 180, lineItems: [{ label: "Synthetic cleaning", amountZar: 850 }] },
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
      return route.fulfill({ status: 200, json: { catalog: { "regular-cleaning": {
        ...SERVICE_CONFIG["regular-cleaning"], basePrice: 500, showEquipmentQuestion: true,
        pricePerBedroom: 0, pricePerBathroom: 0, pricePerExtraRoom: 0, serviceFeeZar: 0,
        durationBaseHours: 3, durationPerBedroomHours: 0, durationPerBathroomHours: 0,
        durationPerExtraRoomHours: 0, minDurationHours: 1, maxDurationHours: 12,
      } }, scheduling: {
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

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    console.error("[FCO unified failure]", page.url(), (await page.locator("body").innerText()).slice(-12000));
  }
});

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
  // The safe behavior is a disabled payment CTA, not a clickable CTA that
  // accepts the action and then redirects. Never force-click a disabled control.
  // A successful price response must not enable payment while logistics remain unresolved.
  await expect.poll(async () => ((await saved(page)).quoteLock as { quoteSignature?: string } | null)?.quoteSignature).toBe("test-lock-only");
  const paymentButton = page.getByRole("button", { name: /Proceed to payment/ });
  await expect(paymentButton).toBeDisabled();
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

async function assertJourneyLayout(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const logo = page.getByRole("link", { name: "Shalean home", exact: true }).filter({ visible: true });
  await expect(logo).toHaveCount(1);
  // The summary must stay inside its own desktop column rather than floating
  // across the form at intermediate screen widths.
  if (width >= 1024) {
    const summary = await page.getByRole("complementary").boundingBox();
    const form = await page.locator("[data-booking-stage]").boundingBox();
    expect(summary!.x).toBeGreaterThanOrEqual(form!.x + form!.width);
    expect(summary!.x + summary!.width).toBeLessThanOrEqual(width + 1);
  }
}

for (const { width, recurring } of [
  ...[320, 375, 768, 1024, 1440].map((width) => ({ width, recurring: false })),
  { width: 1440, recurring: true },
]) {
  test(`FCO-01 unified journey: Home, single Schedule, Your Details, Payment at ${width}px (${recurring ? "recurring" : "once-off"})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page, recurring ? {
      ...sampleDraft("no"), bookingType: "recurring", recurringFrequency: "weekly",
      recurringDays: ["Tuesday"], recurringStartDate: "2026-12-15",
    } : sampleDraft("no"));
    const events = await sandbox(page);
    await page.route("**/api/booking-v2/available-cleaners?**", (route) => route.fulfill({
      status: 200, json: { cleaners: [] },
    }));
    await page.goto("/book/regular-cleaning?step=details&section=address", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/section=/);
    const progress = page.getByRole("navigation", { name: "Booking progress" }).filter({ visible: true });
    await expect(progress.getByRole("button", { name: "Home", exact: true })).toHaveAttribute("aria-current", "step");
    await expect(progress.getByRole("button", { name: "Your Details", exact: true })).toBeVisible();
    await expect(progress.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
    await expect(page.getByText("Due today", { exact: true })).toHaveCount(0);
    await assertJourneyLayout(page, width);
    if (process.env.FCO_CAPTURE_SCREENSHOTS === "true" && !recurring) {
      await page.screenshot({ path: `test-results/regular-home-${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: /See available dates/ }).click();
    await expect(page).toHaveURL(/step=schedule/);
    // Date, recurrence and cleaner preference belong to one Schedule page.
    await expect(page.getByText("Pick a date", { exact: false }).first()).toBeVisible();
    const next = page.getByRole("button", { name: /Continue to Your Details/ });
    await expect(next).toBeEnabled();
    await assertJourneyLayout(page, width);
    const back = await page.getByRole("button", { name: "Back to Home", exact: true }).boundingBox();
    const forward = await next.boundingBox();
    expect(back!.height).toBeGreaterThanOrEqual(44);
    expect(forward!.height).toBeGreaterThanOrEqual(44);
    if (width < 640) expect(back!.y).toBeGreaterThanOrEqual(forward!.y + forward!.height);
    await next.click();
    await expect(page).toHaveURL(/step=review/);
    await assertJourneyLayout(page, width);
    await expect(page.locator("#address")).toHaveValue(address1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Summary address edits stay in the new Your Details stage.
    // Expand the mobile summary when needed.
    const toggle = page.getByRole("button", { name: /^Booking summary/ });
    if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
    await page.getByRole("button", { name: "Edit address", exact: true }).click();
    await expect(page).toHaveURL(/step=review/);
    await expect(page).not.toHaveURL(/section=/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: /Proceed to payment/ }).click();
    await expect(page).toHaveURL(/step=payment/);
    await expect(progress.getByRole("button", { name: "Payment", exact: true })).toHaveAttribute("aria-current", "step");
    await assertJourneyLayout(page, width);
    if (process.env.FCO_CAPTURE_SCREENSHOTS === "true" && !recurring) {
      await page.screenshot({ path: `test-results/regular-payment-${width}.png`, fullPage: true });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(events.blocked).toEqual([]);
  });
}

test("FCO-01 saved recurring draft does not show a final payment before address delivery pricing", async ({ page }) => {
  await seed(page, { ...sampleDraft(), bookingType: "recurring", recurringFrequency: "weekly", recurringStartDate: "2026-12-15" });
  await sandbox(page);
  await page.goto("/book/regular-cleaning?step=details&section=pets", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/section=/);
  await expect(page.getByText("Delivery fee pending", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Due today", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Pay all visits now/)).toHaveCount(0);
});
