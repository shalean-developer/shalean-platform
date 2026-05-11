import { test, expect } from "@playwright/test";
import { jwtEmail, jwtSub } from "./helpers/jwt";
import {
  alignmentFromAdmin,
  alignmentFromCleanerJob,
  alignmentFromCustomerBooking,
  expectLifecycleAlignedTriplet,
} from "./helpers/lifecycleAlignment";
import { postDispatchLoadTestBooking } from "./helpers/loadTestBooking";

const dispatchOn = process.env.E2E_DISPATCH === "1";
const loadSecret = process.env.E2E_DISPATCH_LOAD_TEST_SECRET?.trim() ?? "";
const customerJwt = process.env.E2E_CUSTOMER_SUPABASE_JWT?.trim() ?? "";
const cleanerJwt = process.env.E2E_CLEANER_SUPABASE_JWT?.trim() ?? "";
const adminJwt = process.env.E2E_ADMIN_SUPABASE_JWT?.trim() ?? "";
const selectedCleanerId = process.env.E2E_DISPATCH_SELECTED_CLEANER_ID?.trim().toLowerCase() ?? "";

test.describe("Selected-cleaner offer accept + lifecycle alignment", () => {
  test.beforeEach(() => {
    test.skip(!dispatchOn, "Set E2E_DISPATCH=1.");
    test.skip(!loadSecret, "Set E2E_DISPATCH_LOAD_TEST_SECRET.");
    test.skip(!customerJwt, "Set E2E_CUSTOMER_SUPABASE_JWT.");
    test.skip(!cleanerJwt, "Set E2E_CLEANER_SUPABASE_JWT.");
    test.skip(!adminJwt, "Set E2E_ADMIN_SUPABASE_JWT.");
    test.skip(!/^[0-9a-f-]{36}$/i.test(selectedCleanerId), "Set E2E_DISPATCH_SELECTED_CLEANER_ID to the cleaners.id that matches E2E_CLEANER_SUPABASE_JWT.");
  });

  test("pending offer → accept → assigned; dashboards agree", async ({ request }) => {
    const sub = jwtSub(customerJwt);
    const email = jwtEmail(customerJwt);
    expect(sub).toBeTruthy();

    const created = await postDispatchLoadTestBooking(request, loadSecret, {
      dispatchVariant: "user_selected_offer",
      selectedCleanerId,
      linkUserId: sub!,
      ...(email ? { customerEmail: email } : {}),
    });
    expect(created.status, created.text).toBe(200);
    expect(created.json.ok).toBe(true);
    const bookingId = String(created.json.bookingId ?? "");
    const offerId = String(created.json.offerId ?? "");
    expect(bookingId.length).toBeGreaterThan(10);
    expect(offerId.length).toBeGreaterThan(10);

    const offersRes = await request.get("/api/cleaner/offers", {
      headers: { Authorization: `Bearer ${cleanerJwt}` },
    });
    expect(offersRes.status(), await offersRes.text()).toBe(200);
    const offersBody = (await offersRes.json()) as { offers?: Array<{ id?: string; booking_id?: string }> };
    const hit = (offersBody.offers ?? []).find((o) => String(o.booking_id) === bookingId && String(o.id) === offerId);
    expect(hit, "Cleaner offers API should surface the seeded dispatch offer").toBeTruthy();

    const acceptRes = await request.post(`/api/cleaner/offers/${encodeURIComponent(offerId)}/accept`, {
      headers: { Authorization: `Bearer ${cleanerJwt}` },
    });
    expect(acceptRes.status(), await acceptRes.text()).toBe(200);
    const acceptJson = (await acceptRes.json()) as { ok?: boolean };
    expect(acceptJson.ok).toBe(true);

    const custRes = await request.get("/api/customer/bookings", {
      headers: { Authorization: `Bearer ${customerJwt}` },
    });
    expect(custRes.status()).toBe(200);
    const custBody = (await custRes.json()) as { bookings?: Record<string, unknown>[] };
    const bookingRow = (custBody.bookings ?? []).find((b) => String(b.id) === bookingId);
    expect(bookingRow).toBeTruthy();

    const cleanerDash = await request.get("/api/cleaner/dashboard", {
      headers: { Authorization: `Bearer ${cleanerJwt}` },
    });
    expect(cleanerDash.status()).toBe(200);
    const dashBody = (await cleanerDash.json()) as { jobs?: Record<string, unknown>[] };
    const job = (dashBody.jobs ?? []).find((j) => String(j.id) === bookingId);
    expect(job, "Cleaner dashboard should list the job after accept").toBeTruthy();

    const adminRes = await request.get(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
      headers: { Authorization: `Bearer ${adminJwt}` },
    });
    expect(adminRes.status()).toBe(200);
    const adminBody = (await adminRes.json()) as {
      booking?: Record<string, unknown>;
      dashboardLifecycle?: unknown;
    };

    expectLifecycleAlignedTriplet({
      customer: alignmentFromCustomerBooking(bookingRow!),
      cleaner: alignmentFromCleanerJob(job!),
      admin: alignmentFromAdmin(adminBody.dashboardLifecycle),
    });

    expect(String(adminBody.booking?.cleaner_id ?? "").trim()).toBe(selectedCleanerId);
  });
});
