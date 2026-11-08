import { expect, test, type Page } from "@playwright/test";

const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const CITY_ID = "22222222-2222-4222-8222-222222222222";

function captureIsolatedBrowserDiagnostics(page: Page) {
  page.on("pageerror", (error) => console.error("[FCO-01 pageerror]", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error("[FCO-01 console]", message.text());
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(page.url() || "http://127.0.0.1:3000").origin) {
      console.error("[FCO-01 failed-request]", url.pathname, request.failure()?.errorText);
    }
  });
}

async function assertHomeVisible(page: Page) {
  const heading = page.getByRole("heading", { name: "Tell us about your home" });
  if (!(await heading.isVisible())) {
    const snapshot = await page.locator("body").innerText().catch(() => "<unavailable>");
    console.error("[FCO-01 actual-page]", JSON.stringify({
      url: page.url(),
      title: await page.title().catch(() => "<unavailable>"),
      bodyPreview: snapshot.slice(0, 1800),
      loadingShell: await page.locator('[aria-label="Loading booking form"]').count(),
    }));
  }
  await expect(heading).toBeVisible();
}

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

for (const width of [320, 375, 1440]) {
  test("FCO-01 guarded Home at " + width + "px: explicit equipment, suburb and safe navigation", async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    captureIsolatedBrowserDiagnostics(page);
    const sandbox = await isolateBooking(page);
    const response = await page.goto("/book/regular-cleaning?step=details", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await assertHomeVisible(page);
    await expect(page.getByRole("radio", { name: "I will provide equipment" })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: "Shalean should bring equipment" })).not.toBeChecked();

    // A disabled control cannot report its own failed click; the Home UI gives
    // explicit readiness feedback and guarded Continue has no effect until ready.
    await page.getByRole("button", { name: "See available dates" }).click();
    await expect(page).toHaveURL(/step=details/);

    await expect(page.locator('[aria-label="Your home"] select')).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: /Property type/i })).toHaveCount(0);
    const properties = page.getByRole("radiogroup", { name: "Property type", exact: true });
    await expect(properties).toHaveAttribute("aria-required", "true");
    const house = properties.getByRole("radio", { name: "House", exact: true });
    const apartment = properties.getByRole("radio", { name: "Apartment", exact: true });
    const townhouse = properties.getByRole("radio", { name: "Townhouse", exact: true });
    await expect(house).not.toBeChecked();
    const boxes = await Promise.all([house, apartment, townhouse].map((card) => card.boundingBox()));
    expect(Math.max(...boxes.map((box) => box!.y)) - Math.min(...boxes.map((box) => box!.y))).toBeLessThanOrEqual(1);
    expect(boxes[0]!.x + boxes[0]!.width).toBeLessThan(boxes[1]!.x);
    expect(boxes[1]!.x + boxes[1]!.width).toBeLessThan(boxes[2]!.x);
    expect(boxes[2]!.x + boxes[2]!.width).toBeLessThanOrEqual(width + 1);
    await house.focus();
    await house.press("ArrowRight");
    await expect(apartment).toBeChecked();
    await expect(apartment).toBeFocused();
    await apartment.press("ArrowRight");
    await expect(townhouse).toBeChecked();
    await townhouse.press("ArrowRight");
    await expect(house).toBeChecked();
    await house.press("Tab");
    await expect(page.getByRole("combobox", { name: /Number of bedrooms/i })).toBeFocused();

    async function choose(label: RegExp, option: string) {
      const trigger = page.getByRole("combobox", { name: label });
      await trigger.click();
      const panel = page.getByRole("listbox");
      await expect(panel).toBeVisible();
      const bounds = await panel.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await panel.getByRole("option", { name: option, exact: true }).click();
      await expect(trigger).toContainText(option);
      await expect(trigger).toBeFocused();
      await expect(panel).toHaveCount(0);
    }
    await choose(/Number of bedrooms/i, "2 bedrooms");
    await choose(/Number of bathrooms/i, "1 bathroom");
    // Explicit zero remains valid; requiredness is exposed on the custom combobox.
    const extraRooms = page.getByRole("combobox", { name: /Number of extra rooms/i });
    await expect(extraRooms).toHaveAttribute("aria-required", "true");
    await choose(/Number of extra rooms/i, "No extra rooms");
    await choose(/Do you have any pets/i, "No");
    await page.getByRole("radio", { name: "I will provide equipment" }).check();
    await choose(/Cleaning suburb/i, "Claremont");
    await expect(page.getByText("Home details complete")).toBeVisible();
    await page.getByRole("button", { name: "See available dates" }).click();
    await expect(page).toHaveURL(/step=schedule/);
    await expect(page.getByRole("button", { name: /Continue to Your Details/ })).toBeDisabled();
    await expect(page.locator("#regular-schedule-readiness")).toContainText("Choose a date");
    await expect(page.getByRole("button", { name: /Continue to Your Details/ })).toHaveAttribute("aria-describedby", "regular-schedule-readiness");
    expect(sandbox.unexpectedMutations).toEqual([]);
    expect(sandbox.externalApiRequests.filter((path) => path.includes("confirm"))).toEqual([]);
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflows, "page should not overflow viewport horizontally").toBe(false);
  });
}

test("FCO-01 incomplete deep link cannot bypass Home validation", async ({ page }) => {
  captureIsolatedBrowserDiagnostics(page);
  const sandbox = await isolateBooking(page);
  await page.goto("/book/regular-cleaning?step=payment&section=address", { waitUntil: "domcontentloaded" });
  if (!/step=details/.test(page.url())) {
    console.error("[FCO-01 deep-link-page]", (await page.locator("body").innerText().catch(() => "<unavailable>")).slice(0, 1800));
  }
  await expect(page).toHaveURL(/step=details/);
  expect(sandbox.unexpectedMutations).toEqual([]);
});
