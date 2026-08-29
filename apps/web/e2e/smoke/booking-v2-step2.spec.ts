import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "shalean:booking-v2:v1";
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const CITY_ID = "22222222-2222-4222-8222-222222222222";

type CleanerMode = "team" | "individual_cleaners";

type StoredDraft = Record<string, unknown> & {
  bookingType?: string;
  date?: string;
  time?: string;
  recurringFrequency?: string;
  recurringDays?: string[];
  cleanerCount?: number;
  selectedCleanerIds?: string[];
  assignedTeamId?: string;
  pricingSummary?: { total?: number; estimated_total?: number };
};

function baseDraft(serviceSlug: string, cleanerMode: CleanerMode): Record<string, unknown> {
  return {
    serviceSlug,
    serviceDetails: {
      propertyType: "house",
      bedrooms: "2",
      bathrooms: "1",
      extraRooms: "0",
      hasPets: "no",
      lastCleaned: "1_3_months",
    },
    address: "1 Playwright Test Street",
    suburb: "Claremont",
    serviceAreaLocationId: LOCATION_ID,
    serviceAreaCityId: CITY_ID,
    city: "Cape Town",
    postalCode: "7708",
    contactPhone: "+27710000000",
    equipmentRequired: "no",
    bookingType: "once_off",
    date: "",
    time: "",
    recurringFrequency: "",
    recurringDays: [],
    recurringStartDate: "",
    recurringEndDate: "",
    cleanerMode,
    assignedTeamId: "",
    assignedTeamName: "",
    cleanerCount: 1,
    selectedCleanerIds: [],
    selectedCleanerDetails: [],
    selectedExtras: [],
  };
}

async function seedDraft(page: Page, serviceSlug: string, cleanerMode: CleanerMode) {
  const draft = baseDraft(serviceSlug, cleanerMode);
  await page.addInitScript(
    ({ key, value }) => {
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
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

    if (path === "/api/booking/time-slots") {
      await route.fulfill({
        status: 200,
        json: {
          slots: [
            { time: "08:00", available: true, availableInstant: true, fulfillmentMode: "instant" },
            { time: "08:30", available: true, availableInstant: true, fulfillmentMode: "instant" },
            { time: "09:00", available: true, availableInstant: true, fulfillmentMode: "instant" },
            { time: "09:30", available: false, availableInstant: false, fulfillmentMode: "instant" },
          ],
        },
      });
      return;
    }

    if (path === "/api/booking-v2/available-cleaners") {
      await route.fulfill({
        status: 200,
        json: {
          cleaners: [
            {
              id: "cleaner-alice",
              name: "Alice Test",
              initials: "AT",
              avatarColor: "bg-slate-100 text-slate-700",
              rating: 4.9,
              jobsCompleted: 120,
              areasServed: "Claremont, Rondebosch",
              isAvailable: true,
              slotEligible: true,
              badges: ["recommended"],
              unavailableReason: null,
            },
            {
              id: "cleaner-bob",
              name: "Bob Test",
              initials: "BT",
              avatarColor: "bg-slate-100 text-slate-700",
              rating: 4.8,
              jobsCompleted: 95,
              areasServed: "Claremont",
              isAvailable: true,
              slotEligible: true,
              badges: [],
              unavailableReason: null,
            },
          ],
        },
      });
      return;
    }

    if (path === "/api/booking-v2/team-availability") {
      await route.fulfill({
        status: 200,
        json: {
          available: true,
          teams: [
            { id: "team-alpha", name: "RD Team Alpha", available: true },
            { id: "team-beta", name: "RD Team Beta", available: true },
          ],
        },
      });
      return;
    }

    // Keep this smoke hermetic: no unmocked API request may reach a real backend.
    await route.fulfill({ status: 404, json: { error: `unmocked_e2e_get:${path}` } });
  });

  return forbiddenMutations;
}

async function chooseFutureCalendarDate(page: Page, day: number): Promise<string> {
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: String(day), exact: true }).click();

  await expect.poll(async () => (await readDraft(page)).date ?? "").toMatch(/^\d{4}-\d{2}-\d{2}$/);
  return String((await readDraft(page)).date);
}

test.describe("RD-P05D — Booking V2 Step 2 schedule smoke", () => {
  test("regular cleaning preserves recurring, availability, cleaner, pricing, persistence and navigation behavior", async ({ page }) => {
    await seedDraft(page, "regular-cleaning", "individual_cleaners");
    const forbiddenMutations = await installNonMutatingApiSandbox(page);

    const response = await page.goto("/book/regular-cleaning?step=2", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=2/);
    await expect(page.getByRole("heading", { name: "Schedule your clean" })).toBeVisible();

    await expect.poll(async () => Number((await readDraft(page)).pricingSummary?.total ?? 0)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Recurring", exact: true }).click();
    await expectDraft(page, { bookingType: "recurring" });

    await page.getByRole("button", { name: "Once-off", exact: true }).click();
    await expectDraft(page, { bookingType: "once_off" });

    await page.getByRole("button", { name: "Recurring", exact: true }).click();
    await page.getByRole("button", { name: "Weekly", exact: true }).click();
    await page.getByRole("button", { name: "Mon", exact: true }).click();
    await expectDraft(page, {
      bookingType: "recurring",
      recurringFrequency: "weekly",
      recurringDays: ["Monday"],
    });

    const chosenDate = await chooseFutureCalendarDate(page, 15);
    expect(chosenDate).toMatch(/^\d{4}-\d{2}-15$/);

    await expect(page.getByText("Confirming which times are free in your area…")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "8:30 AM", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "9:30 AM", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "8:30 AM", exact: true }).click();
    await expectDraft(page, { date: chosenDate, time: "08:30" });

    const totalBeforeExtraCleaner = Number((await readDraft(page)).pricingSummary?.total ?? 0);
    await page.getByRole("button", { name: "Add a cleaner" }).click();
    await expectDraft(page, { cleanerCount: 2 });
    await expect
      .poll(async () => Number((await readDraft(page)).pricingSummary?.total ?? 0))
      .toBeGreaterThan(totalBeforeExtraCleaner);

    await expect(page.getByRole("checkbox", { name: /Alice Test/ })).toBeVisible();
    await page.getByRole("checkbox", { name: /Alice Test/ }).click();
    await expectDraft(page, { selectedCleanerIds: ["cleaner-alice"] });

    await page.getByRole("button", { name: "Continue →" }).click();
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=3/);
    await expect(page.getByText("Proceed to payment →")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=2/);
    await expectDraft(page, {
      bookingType: "recurring",
      recurringFrequency: "weekly",
      recurringDays: ["Monday"],
      date: chosenDate,
      time: "08:30",
      cleanerCount: 2,
      selectedCleanerIds: ["cleaner-alice"],
    });

    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=1/);

    expect(forbiddenMutations, "Step 2 smoke must never submit a booking or payment mutation").toEqual([]);
  });

  test("deep cleaning preserves team-mode schedule selection without booking mutation", async ({ page }) => {
    await seedDraft(page, "deep-cleaning", "team");
    const forbiddenMutations = await installNonMutatingApiSandbox(page);

    const response = await page.goto("/book/deep-cleaning?step=2", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/book\/deep-cleaning\?step=2/);
    await expect(page.getByRole("heading", { name: "Book your deep clean" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Team availability" })).toBeVisible();

    const chosenDate = await chooseFutureCalendarDate(page, 16);
    expect(chosenDate).toMatch(/^\d{4}-\d{2}-16$/);

    await expect(page.getByText("Confirming which times are free in your area…")).toHaveCount(0);
    await page.getByRole("button", { name: "9:00 AM", exact: true }).click();
    await expect(page.getByRole("button", { name: /RD Team Alpha/ })).toBeVisible();
    await page.getByRole("button", { name: /RD Team Alpha/ }).click();
    await expectDraft(page, {
      date: chosenDate,
      time: "09:00",
      assignedTeamId: "team-alpha",
    });

    await page.getByRole("button", { name: "Continue →" }).click();
    await expect(page).toHaveURL(/\/book\/deep-cleaning\?step=3/);

    expect(forbiddenMutations, "Team-mode smoke must never submit a booking or payment mutation").toEqual([]);
  });
});
