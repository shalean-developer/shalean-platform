import { test, expect } from "@playwright/test";
import { jwtEmail, jwtSub } from "./helpers/jwt";
import {
  alignmentFromAdmin,
  alignmentFromCleanerJob,
  alignmentFromCustomerBooking,
  expectCustomerAdminLifecycleAligned,
  expectLifecycleAlignedTriplet,
} from "./helpers/lifecycleAlignment";
import { postDispatchLoadTestBooking } from "./helpers/loadTestBooking";

const dispatchOn = process.env.E2E_DISPATCH === "1";
const loadSecret = process.env.E2E_DISPATCH_LOAD_TEST_SECRET?.trim() ?? "";
const customerJwt = process.env.E2E_CUSTOMER_SUPABASE_JWT?.trim() ?? "";
const cleanerJwt = process.env.E2E_CLEANER_SUPABASE_JWT?.trim() ?? "";
const adminJwt = process.env.E2E_ADMIN_SUPABASE_JWT?.trim() ?? "";

test.describe("Dispatch auto-assign + dashboard lifecycle alignment", () => {
  test.beforeEach(() => {
    test.skip(!dispatchOn, "Set E2E_DISPATCH=1.");
    test.skip(!loadSecret, "Set E2E_DISPATCH_LOAD_TEST_SECRET (same value as server DISPATCH_LOAD_TEST_SECRET).");
    test.skip(!customerJwt, "Set E2E_CUSTOMER_SUPABASE_JWT (customer Supabase session JWT).");
    test.skip(!cleanerJwt, "Set E2E_CLEANER_SUPABASE_JWT (cleaner Supabase session JWT).");
    test.skip(!adminJwt, "Set E2E_ADMIN_SUPABASE_JWT (admin Supabase session JWT).");
  });

  test("finalized load-test booking is visible on customer, cleaner, admin with aligned dashboardLifecycle", async ({
    request,
  }) => {
    const sub = jwtSub(customerJwt);
    const email = jwtEmail(customerJwt);
    expect(sub, "Customer JWT must include sub").toBeTruthy();

    const created = await postDispatchLoadTestBooking(request, loadSecret, {
      dispatchVariant: "auto",
      linkUserId: sub!,
      ...(email ? { customerEmail: email } : {}),
    });
    expect(created.status, created.text).toBe(200);
    expect(created.json.ok).toBe(true);
    const bookingId = String(created.json.bookingId ?? "");
    expect(bookingId.length).toBeGreaterThan(10);

    const assignmentKind = created.json.assignmentKind;
    const assignedCleanerId =
      assignmentKind === "individual" ? String(created.json.cleanerId ?? "").trim() : "";
    const assignedTeamId = assignmentKind === "team" ? String(created.json.teamId ?? "").trim() : "";

    if (assignmentKind === "team") {
      test.skip(true, "Team assignment: cleaner dashboard assertions require a roster cleaner JWT or extended harness.");
    }

    expect(assignedCleanerId || assignedTeamId, "Expected individual cleanerId or teamId from dispatch").toBeTruthy();

    const custRes = await request.get("/api/customer/bookings", {
      headers: { Authorization: `Bearer ${customerJwt}` },
    });
    expect(custRes.status(), await custRes.text()).toBe(200);
    const custBody = (await custRes.json()) as { bookings?: Record<string, unknown>[] };
    const bookingRow = (custBody.bookings ?? []).find((b) => String(b.id) === bookingId);
    expect(bookingRow, "Customer API should list the linked booking").toBeTruthy();

    const cleanerRes = await request.get("/api/cleaner/dashboard", {
      headers: { Authorization: `Bearer ${cleanerJwt}` },
    });
    expect(cleanerRes.status(), await cleanerRes.text()).toBe(200);
    const cleanerBody = (await cleanerRes.json()) as { jobs?: Record<string, unknown>[] };
    const jobs = cleanerBody.jobs ?? [];
    const job = jobs.find((j) => String(j.id) === bookingId);

    const adminRes = await request.get(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
      headers: { Authorization: `Bearer ${adminJwt}` },
    });
    expect(adminRes.status(), await adminRes.text()).toBe(200);
    const adminBody = (await adminRes.json()) as {
      booking?: Record<string, unknown>;
      dashboardLifecycle?: unknown;
    };
    expect(adminBody.booking?.id ?? bookingId).toBe(bookingId);

    const adminAlign = alignmentFromAdmin(adminBody.dashboardLifecycle);
    const custAlign = alignmentFromCustomerBooking(bookingRow!);

    if (job && assignmentKind === "individual" && assignedCleanerId) {
      expect(String(job.cleaner_id ?? "").trim()).toBe(assignedCleanerId);
      expectLifecycleAlignedTriplet({
        customer: custAlign,
        cleaner: alignmentFromCleanerJob(job),
        admin: adminAlign,
      });
    } else {
      expectCustomerAdminLifecycleAligned(custAlign, adminAlign);
    }

    if (assignmentKind === "individual") {
      expect(adminBody.booking?.cleaner_id ?? "").toBe(assignedCleanerId);
    }

  });
});
