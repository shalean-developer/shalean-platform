import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "shalean:booking-v2:v1";
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const CITY_ID = "22222222-2222-4222-8222-222222222222";

type StoredDraft = Record<string, unknown> & {
  serviceSlug?: string;
  address?: string;
  bookingType?: string;
  date?: string;
  time?: string;
  pendingBookingId?: string | null;
};

function paymentDraft(serviceSlug: string): Record<string, unknown> {
  return {
    serviceSlug,
    serviceDetails: {
      propertyType: "house",
      bedrooms: "2",
      bathrooms: "1",
      extraRooms: "0",
      hasPets: "no",
    },
    address: "1 Payment Test Street",
    suburb: "Claremont",
    serviceAreaLocationId: LOCATION_ID,
    serviceAreaCityId: CITY_ID,
    city: "Cape Town",
    postalCode: "7708",
    accessInstructions: "Ring the bell",
    parkingInstructions: "Street parking",
    gateCode: "1234",
    contactPhone: "+27710000000",
    selectedExtras: [],
    equipmentRequired: "no",
    equipmentQuote: null,
    bookingType: "once_off",
    date: "2026-11-16",
    time: "08:30",
    alternativeDate: "",
    alternativeTime: "",
    recurringFrequency: "",
    recurringDays: [],
    recurringStartDate: "",
    recurringEndDate: "",
    cleanerMode: "individual_cleaners",
    assignedTeamId: "",
    assignedTeamName: "",
    cleanerCount: 1,
    selectedCleanerIds: [],
    selectedCleanerDetails: [],
    pendingBookingId: null,
  };
}

async function seedDraft(page: Page, serviceSlug: string) {
  const draft = paymentDraft(serviceSlug);
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: draft },
  );
}

async function readDraft(page: Page): Promise<StoredDraft> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredDraft) : {};
  }, STORAGE_KEY);
}

async function expectDraft(page: Page, expected: Record<string, unknown>) {
  await expect
    .poll(async () => readDraft(page), { timeout: 7_500 })
    .toMatchObject(expected);
}

async function installNonMutatingApiSandbox(page: Page): Promise<string[]> {
  const forbiddenMutations: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.startsWith("/api/analytics/")) {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (request.method() !== "GET") {
      forbiddenMutations.push(`${request.method()} ${path}`);
      await route.abort("blockedbyclient");
      return;
    }

    if (path === "/api/booking-v2/services") {
      await route.fulfill({
        status: 200,
        json: {
          catalog: {},
          scheduling: {
            leadMinutes: 0,
            slotStartHour: 8,
            slotEndHour: 12,
            slotIntervalMinutes: 30,
            timezone: "Africa/Johannesburg",
          },
        },
      });
      return;
    }

    await route.fulfill({ status: 404, json: { error: `unmocked_e2e_get:${path}` } });
  });

  return forbiddenMutations;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("RD-P05F — Booking V2 Step 4 payment presentation smoke", () => {
  test("regular payment keeps the auth gate presentation-only and preserves the booking draft", async ({ page }) => {
    await seedDraft(page, "regular-cleaning");
    const forbiddenMutations = await installNonMutatingApiSandbox(page);

    const response = await page.goto("/book/regular-cleaning?step=4", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=4/);

    await expect(page.getByRole("heading", { name: "Payment", exact: true })).toBeVisible();
    await expect(page.getByText("Sign in or create an account to complete your booking.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in to confirm your booking", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.locator("#si-password")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create an account", exact: true })).toBeVisible();
    await expect(page.getByLabel(/Full name/)).toBeVisible();
    await expect(page.getByLabel(/Phone number/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account & continue", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Sign in to confirm your booking", exact: true })).toBeVisible();

    await expectDraft(page, {
      serviceSlug: "regular-cleaning",
      address: "1 Payment Test Street",
      bookingType: "once_off",
      date: "2026-11-16",
      time: "08:30",
      pendingBookingId: null,
    });

    expect(forbiddenMutations, "Payment presentation smoke must not confirm a booking or start payment").toEqual([]);
  });

  test("mobile payment stays within the viewport and Back returns to Review without a mutation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDraft(page, "regular-cleaning");
    const forbiddenMutations = await installNonMutatingApiSandbox(page);

    const response = await page.goto("/book/regular-cleaning?step=4", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=4/);
    await expect(page.getByRole("heading", { name: "Payment", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "← Back", exact: true }).click();
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=3/);
    await expect(page.getByRole("heading", { name: "Review your booking", exact: true })).toBeVisible();

    await expectDraft(page, {
      address: "1 Payment Test Street",
      date: "2026-11-16",
      time: "08:30",
    });

    expect(forbiddenMutations, "Back navigation must not submit booking/payment mutations").toEqual([]);
  });
});
