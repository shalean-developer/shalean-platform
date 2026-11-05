import { expect, test, type Page } from "@playwright/test";

const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const CITY_ID = "22222222-2222-4222-8222-222222222222";

async function isolateBooking(page: Page) {
  const unexpectedMutations: string[] = [];
  const externalApiRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path.startsWith("/api/analytics/")) {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (method === "POST" && path === "/api/booking-v2/quote") {
      await route.fulfill({
        status: 200,
        json: {
          pricingSummary: {
            total: 500, estimated_total: 500, quote_signature: "isolated-e2e-only",
            estimated_duration_minutes: 180, lineItems: [],
          },
          quoteLock: {
            pricingVersionId: "11111111-1111-4111-8111-111111111111",
            quoteSignature: "isolated-e2e-only",
            lockedAt: "2026-11-05T10:00:00.000Z",
            expiresAt: "2099-11-05T10:00:00.000Z",
          },
        },
      });
      return;
    }
    if (method !== "GET") {
      unexpectedMutations.push(method + " " + path);
      await route.abort("blockedbyclient");
      return;
    }
    if (path === "/api/booking-v2/services") {
      await route.fulfill({ status: 200, json: {
        catalog: {},
        scheduling: {
          leadMinutes: 0, slotStartHour: 8, slotEndHour: 12,
          slotIntervalMinutes: 30, timezone: "Africa/Johannesburg",
        },
      } });
      return;
    }
    if (path === "/api/booking/service-locations") {
      await route.fulfill({ status: 200, json: {
        ok: true, locations: [{
          id: LOCATION_ID, city_id: CITY_ID, name: "Claremont", city: "Cape Town",
        }],
      } });
      return;
    }
    if (path === "/api/booking/time-slots") {
      await route.fulfill({ status: 200, json: { slots: [] } });
      return;
    }
    externalApiRequests.push(path);
    await route.fulfill({ status: 404, json: { error: "isolated_e2e_no_backend:" + path } });
  });
  return { unexpectedMutations, externalApiRequests };
}

for (const width of [375, 1440]) {
  test("FCO-01 guarded Home at " + width + "px: explicit equipment, suburb and safe navigation", async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const sandbox = await isolateBooking(page);
    const response = await page.goto("/book/regular-cleaning?step=details", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: "Tell us about your home" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "I will provide equipment" })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: "Shalean should bring equipment" })).not.toBeChecked();

    // A disabled control cannot report its own failed click; the Home UI gives
    // explicit readiness feedback and guarded Continue has no effect until ready.
    await page.getByRole("button", { name: "See available dates" }).click();
    await expect(page).toHaveURL(/step=details/);

    await page.getByLabel(/Property type/i).selectOption("house");
    await page.getByLabel(/Number of bedrooms/i).selectOption("2");
    await page.getByLabel(/Number of bathrooms/i).selectOption("1");
    await page.getByLabel(/Number of extra rooms/i).selectOption("0");
    await page.getByLabel(/Do you have any pets/i).selectOption("no");
    await page.getByRole("radio", { name: "I will provide equipment" }).check();
    await page.getByLabel(/Cleaning suburb/i).selectOption(LOCATION_ID);
    await expect(page.getByText("Home details complete")).toBeVisible();
    await page.getByRole("button", { name: "See available dates" }).click();
    await expect(page).toHaveURL(/step=schedule/);
    expect(sandbox.unexpectedMutations).toEqual([]);
    expect(sandbox.externalApiRequests.filter((path) => path.includes("confirm"))).toEqual([]);
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflows, "page should not overflow viewport horizontally").toBe(false);
  });
}

test("FCO-01 incomplete deep link cannot bypass Home validation", async ({ page }) => {
  const sandbox = await isolateBooking(page);
  await page.goto("/book/regular-cleaning?step=payment", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/step=details/);
  expect(sandbox.unexpectedMutations).toEqual([]);
});
