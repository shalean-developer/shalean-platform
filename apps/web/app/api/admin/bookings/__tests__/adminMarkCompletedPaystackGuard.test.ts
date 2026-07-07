import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fix 2 — admin per-booking Paystack POST must reject `admin_mark_completed=true` *before*
 * a Paystack payment link is initialized. See `apps/web/app/api/admin/bookings/route.ts`.
 *
 * Forcing `status='completed'` on a `pending_payment` row would (a) violate the
 * `bookings_paid_*` invariants once `payment_status='success'` is later written by
 * `upsertBookingFromPaystack` (Fix 1), and (b) cause the upsert to skip-finalize because
 * it filters `status='pending_payment'`. Off-platform settlement uses `adminMarkBookingPaid`.
 *
 * M-1 — there used to be a second, statically-unreachable `if (adminMarkCompleted)`
 * block AFTER the guard that updated the just-created Paystack row to
 * `status='completed'` directly. That block is dangerous if the guard ever
 * regresses (it would bypass the protected completion path entirely), so
 * M-1 removed it. The regression assertions below pin both the guard AND the
 * absence of any direct `status: "completed"` write inside the per-booking
 * Paystack branch so a future refactor can't quietly re-introduce it.
 */
describe("admin booking POST: admin_mark_completed guard for Paystack per-booking", () => {
  const root = process.cwd();
  const routePath = join(root, "app/api/admin/bookings/route.ts");

  it("admin route rejects admin_mark_completed for per-booking Paystack flow with 400 + machine code", () => {
    const src = readFileSync(routePath, "utf8");
    expect(src).toMatch(/admin_mark_completed_unsafe_for_payment_link/);
    expect(src).toMatch(
      /Cannot mark a Paystack payment-link booking as completed before payment is confirmed/,
    );
  });

  it("guard runs after the monthly-billing gate (so monthly path is unaffected)", () => {
    const src = readFileSync(routePath, "utf8");
    const monthlyGateIdx = src.indexOf('createBillingType === "monthly"');
    const guardIdx = src.indexOf("admin_mark_completed_unsafe_for_payment_link");
    expect(monthlyGateIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(monthlyGateIdx);
  });

  it("guard runs before processPaystackInitializeBody (no Paystack call when blocked)", () => {
    const src = readFileSync(routePath, "utf8");
    const guardIdx = src.indexOf("admin_mark_completed_unsafe_for_payment_link");
    const paystackInitIdx = src.indexOf("processPaystackInitializeBody(paystackBody");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(paystackInitIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(paystackInitIdx);
  });

  /* -------------------------------------------------------------- */
  /* M-1 regression — no dead admin_mark_completed completion block  */
  /* -------------------------------------------------------------- */

  it("M-1: per-booking Paystack branch contains exactly ONE `if (adminMarkCompleted)` mention — the guard itself", () => {
    const src = readFileSync(routePath, "utf8");
    const guardIdx = src.indexOf("admin_mark_completed_unsafe_for_payment_link");
    expect(guardIdx).toBeGreaterThan(-1);
    const afterGuard = src.slice(guardIdx);
    const adminMarkBranches = afterGuard.match(/if\s*\(\s*adminMarkCompleted\b/g) ?? [];
    expect(adminMarkBranches).toHaveLength(0);
  });

  it("M-1: no `bookings.update({ status: 'completed' })` write exists in the per-booking Paystack branch", () => {
    const src = readFileSync(routePath, "utf8");
    const guardIdx = src.indexOf("admin_mark_completed_unsafe_for_payment_link");
    const perBookingBranch = src.slice(guardIdx);

    expect(perBookingBranch).not.toMatch(/\.from\(\s*"bookings"\s*\)\s*\.update\(\s*\{[\s\S]*?status:\s*"completed"/);
    expect(perBookingBranch).not.toMatch(/Could not mark booking completed/);
  });

  it("M-1: the dead block's status-pin (`.eq('status', 'pending_payment')` in an update chain) is gone from the per-booking branch", () => {
    const src = readFileSync(routePath, "utf8");
    const guardIdx = src.indexOf("admin_mark_completed_unsafe_for_payment_link");
    const perBookingBranch = src.slice(guardIdx);

    expect(perBookingBranch).not.toMatch(
      /\.update\([\s\S]{0,400}status:\s*"completed"[\s\S]{0,400}\)\s*\.eq\(\s*"id"[\s\S]{0,200}\.eq\(\s*"status",\s*"pending_payment"/,
    );
  });

  it("M-1: protected completion paths are still the only way to mark a Paystack row completed", () => {
    const src = readFileSync(routePath, "utf8");
    expect(src).toMatch(/runAdminBookingPostCreateNormalizationAndEarnings\(/);
    expect(src).toMatch(/admin_booking_create_per_booking/);
  });

  it("M-1: createdPaystackBookingId post-init still runs the normalization-and-earnings pipeline", () => {
    const src = readFileSync(routePath, "utf8");
    const guardIdx = src.indexOf("admin_mark_completed_unsafe_for_payment_link");
    const branch = src.slice(guardIdx);

    const createdGuardIdx = branch.indexOf("if (createdPaystackBookingId)");
    expect(createdGuardIdx).toBeGreaterThan(-1);

    const closeBraceIdx = branch.indexOf("}", createdGuardIdx);
    expect(closeBraceIdx).toBeGreaterThan(createdGuardIdx);
    const inner = branch.slice(createdGuardIdx, closeBraceIdx + 1);
    expect(inner).toMatch(/runAdminBookingPostCreateNormalizationAndEarnings\(/);
    expect(inner).toMatch(/admin_booking_create_per_booking/);
  });
});
