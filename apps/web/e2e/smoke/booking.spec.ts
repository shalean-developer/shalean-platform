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

  test("widget quote API returns 200 with total_paid_zar", async ({ request }) => {
    const res = await request.post("/api/booking/widget-quote", {
      data: widgetQuoteBody,
      headers: { "Content-Type": "application/json" },
    });
    const text = await res.text();
    expect(res.status(), `body: ${text.slice(0, 500)}`).toBe(200);
    const json = JSON.parse(text) as { total_paid_zar?: number };
    expect(typeof json.total_paid_zar).toBe("number");
    expect(json.total_paid_zar).toBeGreaterThan(0);
  });

  test("widget draft API returns 200 when E2E_WIDGET_DRAFT=1 and server has Supabase admin", async ({
    request,
  }) => {
    const enabled = process.env.E2E_WIDGET_DRAFT === "1";
    test.skip(
      !enabled,
      "Set E2E_WIDGET_DRAFT=1 to run this assertion. Requires apps/web env with working getSupabaseAdmin() " +
        "(e.g. NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on the server process).",
    );

    const res = await request.post("/api/booking/widget-draft", {
      data: widgetDraftBody,
      headers: { "Content-Type": "application/json" },
    });
    const text = await res.text();
    expect(res.status(), `body: ${text.slice(0, 800)}`).toBe(200);
    const json = JSON.parse(text) as { ok?: boolean; bookingId?: string };
    expect(json.ok).toBe(true);
    expect(json.bookingId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
