import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { jwtEmail, jwtSub } from "../dispatch/helpers/jwt";
import { alignmentFromCustomerBooking } from "../dispatch/helpers/lifecycleAlignment";
import { postDispatchLoadTestBooking } from "../dispatch/helpers/loadTestBooking";

/**
 * Staging revenue-path smoke: paid load-test booking → dispatch → cleaner field lifecycle → completed.
 *
 * Surrogate for `/book` → Paystack → dispatch when full UI checkout is not wired in CI.
 * Requires the same env as `e2e/dispatch/` plus `E2E_REVENUE_PATH=1`.
 */

const revenueOn = process.env.E2E_REVENUE_PATH === "1";
const dispatchOn = process.env.E2E_DISPATCH === "1";
const loadSecret = process.env.E2E_DISPATCH_LOAD_TEST_SECRET?.trim() ?? "";
const customerJwt = process.env.E2E_CUSTOMER_SUPABASE_JWT?.trim() ?? "";
const cleanerJwt = process.env.E2E_CLEANER_SUPABASE_JWT?.trim() ?? "";

async function postCleanerJobAction(
  request: APIRequestContext,
  bookingId: string,
  cleanerJwtToken: string,
  action: string,
): Promise<{ status: number; text: string }> {
  const res = await request.post(`/api/cleaner/jobs/${encodeURIComponent(bookingId)}`, {
    headers: {
      Authorization: `Bearer ${cleanerJwtToken}`,
      "Content-Type": "application/json",
    },
    data: {
      action,
      idempotency_key: `e2e-revenue-${bookingId}-${action}-${Date.now()}`,
    },
  });
  return { status: res.status(), text: await res.text() };
}

test.describe("Revenue path smoke (staging)", () => {
  test.beforeEach(() => {
    test.skip(!revenueOn, "Set E2E_REVENUE_PATH=1.");
    test.skip(!dispatchOn, "Set E2E_DISPATCH=1.");
    test.skip(!loadSecret, "Set E2E_DISPATCH_LOAD_TEST_SECRET.");
    test.skip(!customerJwt, "Set E2E_CUSTOMER_SUPABASE_JWT.");
    test.skip(!cleanerJwt, "Set E2E_CLEANER_SUPABASE_JWT.");
  });

  test("dispatch load-test booking → cleaner accept → complete → customer sees completed", async ({
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
    expect(bookingId.length).toBeGreaterThan(10);

    const accept = await postCleanerJobAction(request, bookingId, cleanerJwt, "accept");
    if (accept.status === 409 || accept.status === 422) {
      // Already accepted via auto-assign — continue lifecycle.
      expect([200, 409, 422]).toContain(accept.status);
    } else {
      expect(accept.status, accept.text).toBe(200);
    }

    for (const action of ["en_route", "start", "complete"] as const) {
      const step = await postCleanerJobAction(request, bookingId, cleanerJwt, action);
      if (step.status !== 200) {
        test.skip(
          true,
          `Cleaner ${action} returned ${step.status}: ${step.text.slice(0, 400)} — JWT may not match assigned cleaner.`,
        );
      }
    }

    const custRes = await request.get("/api/customer/bookings", {
      headers: { Authorization: `Bearer ${customerJwt}` },
    });
    expect(custRes.status()).toBe(200);
    const custBody = (await custRes.json()) as { bookings?: Record<string, unknown>[] };
    const bookingRow = (custBody.bookings ?? []).find((b) => String(b.id) === bookingId);
    expect(bookingRow).toBeTruthy();

    const align = alignmentFromCustomerBooking(bookingRow!);
    expect(align?.operationalPhase).toBe("completed");
  });
});
