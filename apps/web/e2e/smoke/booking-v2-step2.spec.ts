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
  const draft = {
    ...baseDraft(serviceSlug, cleanerMode),
    ...(serviceSlug === "regular-cleaning"
      ? { bookingType: "recurring", recurringFrequency: "weekly", recurringDays: ["Monday"] }
      : {}),
  };
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
  await page.locator("#booking-date").click();
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
    const funnelEvents: Array<{step:string;event_type:string;metadata:Record<string,unknown>}> = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/analytics/booking-event") {
        funnelEvents.push(request.postDataJSON());
      }
    });

    const response = await page.goto("/book/regular-cleaning?step=schedule", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=schedule/);
    await expect(page.getByRole("heading", { name: "How often do you need help?" })).toBeVisible();

    await expect.poll(async () => Number((await readDraft(page)).pricingSummary?.total ?? 0)).toBeGreaterThan(0);

    await page.getByRole("radio", { name: /Repeat/ }).click();
    await expectDraft(page, { bookingType: "recurring" });

    await page.getByRole("radio", { name: /One Time/ }).click();
    await expectDraft(page, { bookingType: "once_off" });

    await page.getByRole("radio", { name: /Repeat/ }).click();
    await expectDraft(page, {
      bookingType: "recurring",
      recurringFrequency: "weekly",
      recurringDays: ["Monday"],
    });

    await page.getByRole("button", { name: "Continue →", exact: true }).click();

    const chosenDate = await chooseFutureCalendarDate(page, 15);
    expect(chosenDate).toMatch(/^\d{4}-\d{2}-15$/);

    await expect(page.getByText("Confirming which times are free in your area…")).toHaveCount(0);
    await page.locator("#booking-time").click();
    await expect(page.getByRole("button", { name: "8:30 AM", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "9:30 AM", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "8:30 AM", exact: true }).click();
    await expectDraft(page, { date: chosenDate, time: "08:30" });
    await page.getByRole("button", { name: "Continue →", exact: true }).click();

    const totalBeforeExtraCleaner = Number((await readDraft(page)).pricingSummary?.total ?? 0);
    await page.getByRole("button", { name: "Add another cleaner" }).click();
    await expectDraft(page, { cleanerCount: 2 });
    await expect
      .poll(async () => Number((await readDraft(page)).pricingSummary?.total ?? 0))
      .toBeGreaterThan(totalBeforeExtraCleaner);

    await expect(page.getByRole("checkbox", { name: /Alice Test/ })).toBeVisible();
    await page.getByRole("checkbox", { name: /Alice Test/ }).click();
    await expectDraft(page, { selectedCleanerIds: ["cleaner-alice"] });

    await page.getByRole("button", { name: "Continue to Review →", exact: true }).click();
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=review/);
    await expect(page.getByText("Proceed to payment →")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=schedule/);
    await expectDraft(page, {
      bookingType: "recurring",
      recurringFrequency: "weekly",
      recurringDays: ["Monday"],
      date: chosenDate,
      time: "08:30",
      cleanerCount: 2,
      selectedCleanerIds: ["cleaner-alice"],
    });

    await page.getByRole("button", { name: "← Back", exact: true }).click();
    await page.getByRole("button", { name: "← Back", exact: true }).click();
    await page.getByRole("button", { name: "← Back", exact: true }).click();
    await expect(page).toHaveURL(/\/book\/regular-cleaning\?step=details/);

    await expect.poll(() => funnelEvents.filter((e) => e.step === "datetime" && e.event_type === "view")
      .map((e) => e.metadata.section)).toEqual(expect.arrayContaining(["booking_type", "date_time", "cleaner"]));
    expect(funnelEvents.some((e) => e.step === "datetime" && e.event_type === "back" &&
      e.metadata.from_section === "cleaner" && e.metadata.to_section === "date_time")).toBe(true);
    expect(funnelEvents.every((e) => !("href" in e.metadata))).toBe(true);
    expect(forbiddenMutations, "Step 2 smoke must never submit a booking or payment mutation").toEqual([]);
  });

  test("deep cleaning preserves team-mode schedule selection without booking mutation", async ({ page }) => {
    await seedDraft(page, "deep-cleaning", "team");
    const forbiddenMutations = await installNonMutatingApiSandbox(page);

    const response = await page.goto("/book/deep-cleaning?step=schedule", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/book\/deep-cleaning\?step=schedule/);
    await expect(page.getByRole("heading", { name: "Book your deep clean" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose your cleaning team" })).toBeVisible();

    const chosenDate = await chooseFutureCalendarDate(page, 16);
    expect(chosenDate).toMatch(/^\d{4}-\d{2}-16$/);

    await expect(page.getByText("Confirming which times are free in your area…")).toHaveCount(0);
    await page.locator("#booking-time").click();
    await page.getByRole("button", { name: "9:00 AM", exact: true }).click();

    await expect(page.getByRole("button", { name: /RD Team Alpha/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /RD Team Beta/ })).toBeVisible();
    await expectDraft(page, {
      date: chosenDate,
      time: "09:00",
      assignedTeamId: "",
    });

    await page.getByRole("button", { name: /RD Team Alpha/ }).click();
    await expectDraft(page, {
      date: chosenDate,
      time: "09:00",
      assignedTeamId: "team-alpha",
    });
    await expect(page.getByLabel("Selected")).toBeVisible();

    expect(forbiddenMutations, "Team-mode smoke must never submit a booking or payment mutation").toEqual([]);
  });
});


test("Regular location card validates and continues without submitting booking data", async ({ page }) => {
  await seedDraft(page, "regular-cleaning", "individual_cleaners");
  const forbiddenMutations = await installNonMutatingApiSandbox(page);
  await page.route("**/api/booking/service-locations**", (route) => route.fulfill({
    status: 200, json: { ok: true, locations: [{ id: LOCATION_ID, city_id: CITY_ID, name: "Claremont", city: "Cape Town" }] },
  }));
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/book/regular-cleaning?service=regular-cleaning&step=details&section=address");
    await expect(page.getByRole("heading", { name: "Where do you need cleaning?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Booking summary", exact: true })).toHaveCount(0);
    const street = page.getByLabel("Street address", { exact: false });
    const setLocation = page.getByRole("button", { name: "Set location →", exact: true });
    await street.fill("");
    await expect(setLocation).toBeDisabled();
    await street.fill("1 Playwright Test Street");
    await expect(setLocation).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/regular-location-${viewport.width}.png`, fullPage: true });
    await setLocation.click();
    await expect(page).toHaveURL(/section=property/);
    await expect(page.getByRole("radio", { name: /House/ })).toBeVisible();
    if (viewport.width >= 1024) {
      await expect(page.getByRole("heading", { name: "Booking summary", exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: /^Booking summary/ })).toBeVisible();
    }
    await page.getByRole("button", { name: "← Back", exact: true }).click();
    await expect(page).toHaveURL(/section=address/);
    await expect(street).toHaveValue("1 Playwright Test Street");
  }
  expect(forbiddenMutations).toEqual([]);
});

test("Regular property cards require confirmation and retain screen-level funnel navigation", async ({ page }) => {
  const draft = baseDraft("regular-cleaning", "individual_cleaners");
  draft.serviceDetails = { ...(draft.serviceDetails as Record<string, unknown>), propertyType: "" };
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: STORAGE_KEY, value: draft });
  const forbiddenMutations = await installNonMutatingApiSandbox(page);
  await page.route("**/api/booking/service-locations**", (route) => route.fulfill({
    status: 200, json: { ok: true, locations: [{ id: LOCATION_ID, city_id: CITY_ID, name: "Claremont", city: "Cape Town" }] },
  }));
  const events: Array<{event_type:string;metadata:Record<string,unknown>}> = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/analytics/booking-event") events.push(request.postDataJSON());
  });
  for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.goto("/book/regular-cleaning?service=regular-cleaning&step=details&section=property");
    const next = page.getByRole("button", { name: "Continue →", exact: true });
    await expect(next).toBeDisabled();
    await page.getByRole("radio", { name: "Apartment", exact: true }).click();
    await expect(page).toHaveURL(/section=property/);
    await expect(page.getByRole("radio", { name: "Apartment", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "Apartment", exact: true }).press("End");
    await expect(page.getByRole("radio", { name: "Townhouse", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page).toHaveURL(/section=property/);
    const tops = await page.getByRole("radio").evaluateAll(es => es.map(e=>e.getBoundingClientRect().top));
    expect(Math.max(...tops)-Math.min(...tops)).toBeLessThan(2);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await next.click();
    await expect(page).toHaveURL(/section=rooms/);
    await page.getByRole("button", {name:"← Back",exact:true}).click();
    await expect(page).toHaveURL(/section=property/);
    await expect(page.getByRole("radio", {name:"Townhouse",exact:true})).toHaveAttribute("aria-checked","true");
    await expect(next).toBeEnabled();
  }
  await expect.poll(()=>events.some(e=>e.event_type==="view"&&e.metadata.section==="property")).toBe(true);
  await expect.poll(()=>events.some(e=>e.event_type==="next"&&e.metadata.section==="property"&&e.metadata.to_section==="rooms")).toBe(true);
  await expect.poll(()=>events.some(e=>e.event_type==="back"&&e.metadata.section==="rooms"&&e.metadata.to_section==="property")).toBe(true);
  expect(events.every(e=>!("href" in e.metadata))).toBe(true);
  expect(forbiddenMutations).toEqual([]);
});
