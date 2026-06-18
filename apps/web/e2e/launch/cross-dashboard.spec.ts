import { test, expect } from "@playwright/test";
import { jwtEmail, jwtSub } from "../dispatch/helpers/jwt";
import {
  alignmentFromAdmin,
  alignmentFromCleanerJob,
  alignmentFromCustomerBooking,
  expectCustomerAdminLifecycleAligned,
} from "../dispatch/helpers/lifecycleAlignment";
import { postDispatchLoadTestBooking } from "../dispatch/helpers/loadTestBooking";

const launchOn = process.env.E2E_LAUNCH === "1";
const dispatchOn = process.env.E2E_DISPATCH === "1";
const loadSecret = process.env.E2E_DISPATCH_LOAD_TEST_SECRET?.trim() ?? "";
const customerJwt = process.env.E2E_CUSTOMER_SUPABASE_JWT?.trim() ?? "";
const cleanerJwt = process.env.E2E_CLEANER_SUPABASE_JWT?.trim() ?? "";
const adminJwt = process.env.E2E_ADMIN_SUPABASE_JWT?.trim() ?? "";

test.describe("Launch readiness — cross-dashboard", () => {
  test.beforeEach(() => {
    test.skip(!launchOn, "Set E2E_LAUNCH=1.");
    test.skip(!dispatchOn, "Set E2E_DISPATCH=1.");
    test.skip(!loadSecret, "Set E2E_DISPATCH_LOAD_TEST_SECRET.");
    test.skip(!customerJwt, "Set E2E_CUSTOMER_SUPABASE_JWT.");
    test.skip(!adminJwt, "Set E2E_ADMIN_SUPABASE_JWT.");
  });

  test("load-test booking is visible on customer and admin dashboards", async ({ request }) => {
    const sub = jwtSub(customerJwt);
    const email = jwtEmail(customerJwt);
    expect(sub).toBeTruthy();

    const created = await postDispatchLoadTestBooking(request, loadSecret, {
      dispatchVariant: "auto",
      linkUserId: sub!,
      ...(email ? { customerEmail: email } : {}),
    });
    expect(created.status, created.text).toBe(200);
    expect(created.json.ok).toBe(true);
    const bookingId = String(created.json.bookingId ?? "");
    expect(bookingId.length).toBeGreaterThan(10);

    const custRes = await request.get("/api/customer/bookings", {
      headers: { Authorization: `Bearer ${customerJwt}` },
    });
    expect(custRes.status(), await custRes.text()).toBe(200);
    const custBody = (await custRes.json()) as { bookings?: Record<string, unknown>[] };
    const bookingRow = (custBody.bookings ?? []).find((b) => String(b.id) === bookingId);
    expect(bookingRow, "Customer API should list the linked booking").toBeTruthy();

    const adminRes = await request.get(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
      headers: { Authorization: `Bearer ${adminJwt}` },
    });
    expect(adminRes.status(), await adminRes.text()).toBe(200);
    const adminBody = (await adminRes.json()) as {
      booking?: Record<string, unknown>;
      dashboardLifecycle?: unknown;
    };
    expect(adminBody.booking?.id ?? bookingId).toBe(bookingId);

    expectCustomerAdminLifecycleAligned(
      alignmentFromCustomerBooking(bookingRow!),
      alignmentFromAdmin(adminBody.dashboardLifecycle),
    );

    if (created.json.assignmentKind === "team") {
      test.skip(true, "Team assignment: cleaner JWT must match roster for full triplet.");
    }

    if (!cleanerJwt) return;

    const cleanerRes = await request.get("/api/cleaner/dashboard", {
      headers: { Authorization: `Bearer ${cleanerJwt}` },
    });
    expect(cleanerRes.status(), await cleanerRes.text()).toBe(200);
    const cleanerBody = (await cleanerRes.json()) as { jobs?: Record<string, unknown>[] };
    const job = (cleanerBody.jobs ?? []).find((j) => String(j.id) === bookingId);
    if (job) {
      const adminAlign = alignmentFromAdmin(adminBody.dashboardLifecycle);
      const cleanerAlign = alignmentFromCleanerJob(job);
      expect(cleanerAlign?.operationalPhase).toBe(adminAlign?.operationalPhase);
    }
  });
});
