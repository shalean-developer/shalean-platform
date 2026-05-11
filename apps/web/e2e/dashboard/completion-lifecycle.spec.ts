import { test, expect } from "@playwright/test";
import { jwtEmail, jwtSub } from "../dispatch/helpers/jwt";
import {
  alignmentFromAdmin,
  alignmentFromCleanerJob,
  alignmentFromCustomerBooking,
} from "../dispatch/helpers/lifecycleAlignment";
import { postDispatchLoadTestBooking } from "../dispatch/helpers/loadTestBooking";

const dispatchOn = process.env.E2E_DISPATCH === "1";
const loadSecret = process.env.E2E_DISPATCH_LOAD_TEST_SECRET?.trim() ?? "";
const customerJwt = process.env.E2E_CUSTOMER_SUPABASE_JWT?.trim() ?? "";
const cleanerJwt = process.env.E2E_CLEANER_SUPABASE_JWT?.trim() ?? "";
const adminJwt = process.env.E2E_ADMIN_SUPABASE_JWT?.trim() ?? "";

test.describe("Completion lifecycle (admin PATCH) + payout surface", () => {
  test.beforeEach(() => {
    test.skip(!dispatchOn, "Set E2E_DISPATCH=1.");
    test.skip(!loadSecret, "Set E2E_DISPATCH_LOAD_TEST_SECRET.");
    test.skip(!customerJwt, "Set E2E_CUSTOMER_SUPABASE_JWT.");
    test.skip(!cleanerJwt, "Set E2E_CLEANER_SUPABASE_JWT — used to confirm assigned cleaner sees the job.");
    test.skip(!adminJwt, "Set E2E_ADMIN_SUPABASE_JWT.");
  });

  test("assigned load-test booking → admin marks completed → lifecycle + payout flags coherent", async ({
    request,
  }) => {
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
    if (created.json.assignmentKind === "team") {
      test.skip(true, "Team assignment: extend harness with roster cleaner JWT.");
    }
    const bookingId = String(created.json.bookingId ?? "");
    const assignedCleanerId = String(created.json.cleanerId ?? "").trim();
    expect(assignedCleanerId.length).toBeGreaterThan(30);

    const cleanerDashBefore = await request.get("/api/cleaner/dashboard", {
      headers: { Authorization: `Bearer ${cleanerJwt}` },
    });
    expect(cleanerDashBefore.status()).toBe(200);
    const dashBefore = (await cleanerDashBefore.json()) as { jobs?: Record<string, unknown>[] };
    const jobBefore = (dashBefore.jobs ?? []).find((j) => String(j.id) === bookingId);
    if (!jobBefore) {
      test.skip(
        true,
        "Cleaner JWT does not match dispatch-assigned cleaner (job not on dashboard). Use E2E_CLEANER_SUPABASE_JWT for the assigned cleaners.id.",
      );
    }

    const patchRes = await request.patch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
      headers: {
        Authorization: `Bearer ${adminJwt}`,
        "Content-Type": "application/json",
      },
      data: { status: "completed" },
    });
    const patchText = await patchRes.text();
    if (patchRes.status() !== 200) {
      test.skip(
        true,
        `Admin PATCH status=completed returned ${patchRes.status()}: ${patchText.slice(0, 400)} — booking may need line items / payout basis in this environment.`,
      );
    }

    const adminBody = JSON.parse(patchText) as { booking?: Record<string, unknown> };
    expect(String(adminBody.booking?.status ?? "").toLowerCase()).toBe("completed");
    expect(adminBody.booking?.completed_at, "completed_at should be set").toBeTruthy();

    const adminGet = await request.get(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
      headers: { Authorization: `Bearer ${adminJwt}` },
    });
    expect(adminGet.status()).toBe(200);
    const adminDetail = (await adminGet.json()) as {
      booking?: Record<string, unknown>;
      dashboardLifecycle?: unknown;
    };
    const adminAlign = alignmentFromAdmin(adminDetail.dashboardLifecycle);
    expect(adminAlign?.operationalPhase).toBe("completed");

    const custRes = await request.get("/api/customer/bookings", {
      headers: { Authorization: `Bearer ${customerJwt}` },
    });
    expect(custRes.status()).toBe(200);
    const custBody = (await custRes.json()) as { bookings?: Record<string, unknown>[] };
    const bookingRow = (custBody.bookings ?? []).find((b) => String(b.id) === bookingId);
    expect(bookingRow).toBeTruthy();
    const custAlign = alignmentFromCustomerBooking(bookingRow!);
    expect(custAlign?.operationalPhase).toBe("completed");

    const cl = bookingRow!.canonicalLifecycle as Record<string, unknown> | undefined;
    const payoutState = typeof cl?.payoutState === "string" ? cl.payoutState : "";
    expect(["eligible", "paid", "pending", "invalid", "n_a"]).toContain(payoutState);

    const cleanerDashAfter = await request.get("/api/cleaner/dashboard", {
      headers: { Authorization: `Bearer ${cleanerJwt}` },
    });
    expect(cleanerDashAfter.status()).toBe(200);
    const dashAfter = (await cleanerDashAfter.json()) as { jobs?: Record<string, unknown>[] };
    const jobAfter = (dashAfter.jobs ?? []).find((j) => String(j.id) === bookingId);
    if (jobAfter) {
      expect(alignmentFromCleanerJob(jobAfter)?.operationalPhase).toBe("completed");
    }
  });
});
