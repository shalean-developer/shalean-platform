import { test, expect } from "@playwright/test";

const launchOn = process.env.E2E_LAUNCH === "1";
const customerJwt = process.env.E2E_CUSTOMER_SUPABASE_JWT?.trim() ?? "";
const cleanerJwt = process.env.E2E_CLEANER_SUPABASE_JWT?.trim() ?? "";
const adminJwt = process.env.E2E_ADMIN_SUPABASE_JWT?.trim() ?? "";

async function resolveRole(
  request: import("@playwright/test").APIRequestContext,
  jwt: string,
): Promise<{ role?: string; dashboardRoute?: string }> {
  const res = await request.post("/api/auth/resolve-profile", {
    headers: { "Content-Type": "application/json" },
    data: { access_token: jwt },
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as { role?: string; dashboardRoute?: string };
}

test.describe("Launch readiness — role access", () => {
  test.beforeEach(() => {
    test.skip(!launchOn, "Set E2E_LAUNCH=1.");
  });

  test("customer resolves to /account", async ({ request }) => {
    test.skip(!customerJwt, "Set E2E_CUSTOMER_SUPABASE_JWT.");
    const profile = await resolveRole(request, customerJwt);
    expect(profile.role).toBe("customer");
    expect(profile.dashboardRoute).toBe("/account");
  });

  test("cleaner resolves to /jobs", async ({ request }) => {
    test.skip(!cleanerJwt, "Set E2E_CLEANER_SUPABASE_JWT.");
    const profile = await resolveRole(request, cleanerJwt);
    expect(profile.role).toBe("cleaner");
    expect(profile.dashboardRoute).toBe("/jobs");
  });

  test("admin resolves to /office", async ({ request }) => {
    test.skip(!adminJwt, "Set E2E_ADMIN_SUPABASE_JWT.");
    const profile = await resolveRole(request, adminJwt);
    expect(profile.role).toBe("admin");
    expect(profile.dashboardRoute).toBe("/office");
  });

  test("legacy GET /api/bookings is deprecated (no mock bookings)", async ({ request }) => {
    const res = await request.get("/api/bookings");
    expect([410, 200]).toContain(res.status());
    const json = (await res.json()) as { bookings?: { id?: string }[] };
    const mockIds = (json.bookings ?? []).filter((b) => String(b.id ?? "").startsWith("mock-"));
    expect(mockIds.length).toBe(0);
  });
});
