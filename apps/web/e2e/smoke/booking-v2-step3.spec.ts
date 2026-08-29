import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "shalean:booking-v2:v1";
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const CITY_ID = "22222222-2222-4222-8222-222222222222";

type CleanerMode = "team" | "individual_cleaners";

type StoredDraft = Record<string, unknown> & {
  address?: string;
  bookingType?: string;
  recurringFrequency?: string;
  recurringDays?: string[];
  date?: string;
  time?: string;
  cleanerCount?: number;
  selectedCleanerIds?: string[];
  assignedTeamId?: string;
  assignedTeamName?: string;
  pricingSummary?: { total?: number; estimated_total?: number };
};

function reviewDraft(serviceSlug: string, cleanerMode: CleanerMode): Record<string, unknown> {
  const individual = cleanerMode === "individual_cleaners";
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
    address: "1 Review Test Street",
    suburb: "Claremont",
    serviceAreaLocationId: LOCATION_ID,
    serviceAreaCityId: CITY_ID,
    city: "Cape Town",
    postalCode: "7708",
    accessInstructions: "Ring the bell",
    parkingInstructions: "Street parking",
    gateCode: "1234",
    contactPhone: "+27710000000",
    selectedExtras: individual ? ["inside-oven"] : ["inside-cabinets"],
    equipmentRequired: "no",
    equipmentQuote: null,
    bookingType: "recurring",
    date: "2026-11-16",
    time: "08:30",
    alternativeDate: "",
    alternativeTime: "",
    recurringFrequency: "weekly",
    recurringDays: ["Monday"],
    recurringStartDate: "2026-11-16",
    recurringEndDate: "",
    cleanerMode,
    assignedTeamId: individual ? "" : "team-alpha",
    assignedTeamName: individual ? "" : "RD Team Alpha",
    cleanerCount: individual ? 2 : 1,
    selectedCleanerIds: individual ? ["cleaner-alice"] : [],
    selectedCleanerDetails: individual
      ? [
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
        ]
      : [],
  };
}

async function seedDraft(
  page: Page,
  serviceSlug: string,
  cleanerMode: CleanerMode,
  overrides: Record<string, unknown> = {},
) {
  const draft = { ...reviewDraft(serviceSlug, cleanerMode), ...overrides };
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

    // Step 3 should not need a real backend for this seeded review state.
    await route.fulfill({ status: 404, json: { error: `unmocked_e2e_get:${path}` } });
  });

  return forbiddenMutations;
}

async function expectReviewPrice(page: Page) {
  const total = await expect
    .poll(async () => {
      const draft = await readDraft(page);
      return Number(draft.pricingSummary?.estimated_total ?? draft.pricingSummary?.total ?? 0);
    }, { timeout: 7_500 })
    .toBeGreaterThan(0);
  void total;

  const draft = await readDraft(page);
  const amount = Number(draft.pricingSummary?.estimated_total ?? draft.pricingSummary?.total ?? 0);
  await expect(page.getByText(`R${amount.toLocaleString("en-ZA")}`, { exact: true }).first()).toBeVisible();
}

async function expectReviewSectionNumbers(page: Page, titles: string[]) {
  for (const [index, title] of titles.entries()) {
    const heading = page.getByRole("heading", { name: title, exact: true });
    await expect(heading).toBeVisible();
    const labelRow = heading.locator("xpath=..");
    const counterContent = await labelRow.evaluate((element) =>
      window.getComputedStyle(element, "::before").content,
    );
    expect(counterContent.replace(/[\"']/g, "")).toBe(String(index + 1));
  }
}

test.describe("RD-P05E — Booking V2 Step 3 review smoke", () => {
  test("regular review preserves customer, schedule, cleaner, pricing, draft and payment transition", async ({ page }) => {
    await seedDraft(page, "regular-cleaning", "individual_cleaners");
    const forbiddenMutations = await installNonMutatingApiSandbox(page);

    const response = await page.goto("/book/regular-cleaning?step=3", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=3/);
    await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible();

    await expect(page.getByText("Regular Cleaning", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("1 Review Test Street", { exact: true })).toBeVisible();
    await expect(page.getByText("Claremont, Cape Town, 7708", { exact: true })).toBeVisible();
    await expect(page.getByText("08:30", { exact: true })).toBeVisible();
    await expect(page.getByText(/Recurring · Weekly/)).toBeVisible();
    await expect(page.getByText("Alice Test", { exact: true })).toBeVisible();
    await expect(page.getByText("inside-oven", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Price breakdown" })).toBeVisible();
    await expectReviewSectionNumbers(page, [
      "Location",
      "Equipment",
      "Clean details",
      "Schedule",
      "Cleaner preference",
      "Add-ons",
    ]);
    await expectReviewPrice(page);

    await expectDraft(page, {
      address: "1 Review Test Street",
      bookingType: "recurring",
      recurringFrequency: "weekly",
      recurringDays: ["Monday"],
      date: "2026-11-16",
      time: "08:30",
      cleanerCount: 2,
      selectedCleanerIds: ["cleaner-alice"],
    });

    const locationHeading = page.getByRole("heading", { name: "Location" });
    const locationHeader = locationHeading.locator("xpath=../..");
    await locationHeader.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator("#edit-address").fill("99 Temporary Review Street");
    await expectDraft(page, { address: "99 Temporary Review Street" });
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectDraft(page, { address: "1 Review Test Street" });

    await page.getByRole("button", { name: "Proceed to payment →" }).click();
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=4/);

    expect(forbiddenMutations, "Review smoke must not submit a booking or payment mutation").toEqual([]);
  });

  test("deep review preserves assigned team and reaches Payment without booking mutation", async ({ page }) => {
    await seedDraft(page, "deep-cleaning", "team");
    const forbiddenMutations = await installNonMutatingApiSandbox(page);

    const response = await page.goto("/book/deep-cleaning?step=3", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/book\/deep-cleaning\?step=3/);
    await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible();
    await expect(page.getByText("Deep Cleaning", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("RD Team Alpha", { exact: true })).toBeVisible();
    await expect(page.getByText("08:30", { exact: true })).toBeVisible();
    await expect(page.getByText(/Recurring · Weekly/)).toBeVisible();
    await expectReviewSectionNumbers(page, [
      "Location",
      "Equipment",
      "Clean details",
      "Schedule",
      "Add-ons",
    ]);
    await expectReviewPrice(page);

    await expectDraft(page, {
      assignedTeamId: "team-alpha",
      assignedTeamName: "RD Team Alpha",
      date: "2026-11-16",
      time: "08:30",
    });

    await page.getByRole("button", { name: "Proceed to payment →" }).click();
    await expect(page).toHaveURL(/\/book\/deep-cleaning\?step=4/);

    expect(forbiddenMutations, "Team review smoke must not submit a booking or payment mutation").toEqual([]);
  });

  test("review labels a missing time clearly without mutating the draft", async ({ page }) => {
    await seedDraft(page, "regular-cleaning", "individual_cleaners", { time: "" });
    const forbiddenMutations = await installNonMutatingApiSandbox(page);

    const response = await page.goto("/book/regular-cleaning?step=3", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=3/);
    await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible();
    await expect(page.getByText("No time selected.", { exact: true })).toBeAttached();

    const scheduleHeading = page.getByRole("heading", { name: "Schedule", exact: true });
    const scheduleSection = scheduleHeading.locator("xpath=../../..");
    const timeValue = scheduleSection.locator(".grid.grid-cols-2.gap-3 > div:nth-child(2) > p:last-child");
    const fallbackContent = await timeValue.evaluate((element) =>
      window.getComputedStyle(element, "::after").content,
    );
    expect(fallbackContent.replace(/[\"']/g, "")).toBe("Not selected");

    await expectDraft(page, { time: "" });
    expect(forbiddenMutations, "Missing-time presentation check must remain read-only").toEqual([]);
  });
});
