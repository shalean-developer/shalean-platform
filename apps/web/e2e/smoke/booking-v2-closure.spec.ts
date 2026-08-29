import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "shalean:booking-v2:v1";
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const CITY_ID = "22222222-2222-4222-8222-222222222222";
const RETAINED_QUERY = "promo=P05G10&source=rd-p05g&ref=FRIEND123";

const SERVICES = [
  { slug: "regular-cleaning", label: "Regular Cleaning", cleanerMode: "individual_cleaners" },
  { slug: "deep-cleaning", label: "Deep Cleaning", cleanerMode: "team" },
  { slug: "moving-cleaning", label: "Moving Cleaning", cleanerMode: "team" },
  { slug: "office-cleaning", label: "Office Cleaning", cleanerMode: "individual_cleaners" },
  { slug: "carpet-cleaning", label: "Carpet Cleaning", cleanerMode: "individual_cleaners" },
  { slug: "airbnb-cleaning", label: "Airbnb Cleaning", cleanerMode: "individual_cleaners" },
] as const;

type StoredDraft = Record<string, unknown> & {
  serviceSlug?: string;
  address?: string;
  date?: string;
  time?: string;
  pendingBookingId?: string | null;
};

function closureDraft(serviceSlug: string, cleanerMode: string): Record<string, unknown> {
  const teamMode = cleanerMode === "team";
  return {
    serviceSlug,
    serviceDetails: {
      propertyType: "house",
      bedrooms: "2",
      bathrooms: "1",
      extraRooms: "0",
      hasPets: "no",
      lastCleaned: "1_3_months",
      moveType: "move_out",
      furnished: "no",
      depositInspection: "no",
      officeType: "open_plan",
      officeSize: "small",
      frequency: "once_off",
      afterHours: "during_hours",
      carpetRooms: "2",
    },
    address: "1 Closure Test Street",
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
    cleanerMode,
    assignedTeamId: teamMode ? "team-closure" : "",
    assignedTeamName: teamMode ? "Closure Test Team" : "",
    cleanerCount: 1,
    selectedCleanerIds: teamMode ? [] : ["cleaner-closure"],
    selectedCleanerDetails: teamMode
      ? []
      : [
          {
            id: "cleaner-closure",
            name: "Closure Test Cleaner",
            initials: "CT",
            rating: 4.9,
            jobsCompleted: 100,
          },
        ],
    pendingBookingId: null,
  };
}

async function seedDraft(page: Page, serviceSlug: string, cleanerMode: string) {
  const draft = closureDraft(serviceSlug, cleanerMode);
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

    // Promotion, profile, cleaner and other optional GETs stay local and fail closed.
    await route.fulfill({ status: 404, json: { error: `unmocked_e2e_get:${path}` } });
  });

  return forbiddenMutations;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectRetainedBookingParams(page: Page, expectedStep: string) {
  const url = new URL(page.url());
  expect(url.searchParams.get("step")).toBe(expectedStep);
  expect(url.searchParams.get("promo")).toBe("P05G10");
  expect(url.searchParams.get("source")).toBe("rd-p05g");
  expect(url.searchParams.get("ref")).toBe("FRIEND123");
}

test.describe("RD-P05G — Booking V2 closure audit", () => {
  test("booking hub exposes exactly the six governed services on desktop and mobile", async ({ page }) => {
    const forbiddenMutations = await installNonMutatingApiSandbox(page);

    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/book", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { name: "Choose your cleaning service", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: /Request a personalised quote/ })).toBeVisible();

      const serviceLinks = page.locator('a[href^="/book/"]').filter({ has: page.locator("h2") });
      await expect(serviceLinks).toHaveCount(6);
      for (const service of SERVICES) {
        await expect(page.locator(`a[href="/book/${service.slug}"]`)).toHaveCount(1);
        await expect(page.getByRole("heading", { name: service.label, exact: true })).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);
    }

    expect(forbiddenMutations, "Booking hub closure smoke must remain read-only").toEqual([]);
  });

  for (const service of SERVICES) {
    test(`${service.label} Step 1 is contained and exposes accessible booking navigation on desktop/mobile`, async ({ page }) => {
      const forbiddenMutations = await installNonMutatingApiSandbox(page);

      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        const response = await page.goto(`/book/${service.slug}?${RETAINED_QUERY}`, {
          waitUntil: "domcontentloaded",
        });
        expect(response?.status()).toBeLessThan(400);
        await expect(page.getByRole("heading", { name: "Your details", exact: true })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Booking progress" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Details", exact: true })).toHaveAttribute(
          "aria-current",
          "step",
        );
        await expect(page.getByRole("button", { name: "← Back to services", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Continue →", exact: true })).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }

      expect(forbiddenMutations, `${service.label} Step 1 smoke must not submit data`).toEqual([]);
    });

    test(`${service.label} draft resumes and preserves referral/promo/source through Review ↔ Payment`, async ({ page }) => {
      await seedDraft(page, service.slug, service.cleanerMode);
      const forbiddenMutations = await installNonMutatingApiSandbox(page);

      const response = await page.goto(`/book/${service.slug}?step=3&${RETAINED_QUERY}`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { name: "Review your booking", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Review", exact: true })).toHaveAttribute(
        "aria-current",
        "step",
      );
      await expectRetainedBookingParams(page, "3");
      await expectNoHorizontalOverflow(page);

      // A reload proves the local Booking V2 draft is resumable on the same route.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Review your booking", exact: true })).toBeVisible();
      await expect(page.getByText("1 Closure Test Street", { exact: true })).toBeVisible();
      await expectRetainedBookingParams(page, "3");

      const persisted = await readDraft(page);
      expect(persisted).toMatchObject({
        serviceSlug: service.slug,
        address: "1 Closure Test Street",
        date: "2026-11-16",
        time: "08:30",
        pendingBookingId: null,
      });

      await page.getByRole("button", { name: "Proceed to payment →", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/book/${service.slug}\\?`));
      await expectRetainedBookingParams(page, "4");
      await expect(page.getByRole("heading", { name: "Payment", exact: true })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Booking progress" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Payment", exact: true })).toHaveAttribute(
        "aria-current",
        "step",
      );
      await expectNoHorizontalOverflow(page);

      await page.getByRole("button", { name: "← Back", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Review your booking", exact: true })).toBeVisible();
      await expectRetainedBookingParams(page, "3");

      const afterRoundTrip = await readDraft(page);
      expect(afterRoundTrip).toMatchObject({
        serviceSlug: service.slug,
        address: "1 Closure Test Street",
        date: "2026-11-16",
        time: "08:30",
        pendingBookingId: null,
      });

      expect(
        forbiddenMutations,
        `${service.label} closure transition must not confirm a booking or start payment`,
      ).toEqual([]);
    });
  }
});
