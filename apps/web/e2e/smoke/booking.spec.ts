import { expect, test } from "@playwright/test";

const widgetQuoteBody = {
  service: "standard",
  bedrooms: 2,
  bathrooms: 1,
  extraRooms: 0,
  date: "2026-07-15",
  time: "09:00",
  extras: [] as string[],
  location: "Playwright smoke",
};

const widgetDraftBody = {
  ...widgetQuoteBody,
  customer_email: "e2e-widget-draft@example.test",
};

test.describe("booking smoke", () => {
  test("booking entry redirects to /book", async ({ page }) => {
    const response = await page.goto("/booking", { waitUntil: "domcontentloaded" });
    expect(response?.status(), `navigation status was ${response?.status()}`).toBeLessThan(400);
    await expect(page).toHaveURL(/\/book(\/|$|\?)/);
  });

  test("widget quote API returns 410 (retired)", async ({ request }) => {
    const res = await request.post("/api/booking/widget-quote", {
      data: widgetQuoteBody,
      headers: { "Content-Type": "application/json" },
    });
    const text = await res.text();
    expect(res.status(), `body: ${text.slice(0, 500)}`).toBe(410);
    const json = JSON.parse(text) as { retired?: boolean; successor?: string };
    expect(json.retired).toBe(true);
    expect(json.successor).toBe("/book");
  });

  test("widget draft API returns 410 (retired)", async ({ request }) => {
    const res = await request.post("/api/booking/widget-draft", {
      data: widgetDraftBody,
      headers: { "Content-Type": "application/json" },
    });
    const text = await res.text();
    expect(res.status(), `body: ${text.slice(0, 800)}`).toBe(410);
    const json = JSON.parse(text) as { retired?: boolean };
    expect(json.retired).toBe(true);
  });
});
