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
 */
describe("admin booking POST: admin_mark_completed guard for Paystack per-booking", () => {
  const root = process.cwd();

  it("admin route rejects admin_mark_completed for per-booking Paystack flow with 400 + machine code", () => {
    const src = readFileSync(join(root, "app/api/admin/bookings/route.ts"), "utf8");
    expect(src).toMatch(/admin_mark_completed_unsafe_for_payment_link/);
    expect(src).toMatch(
      /Cannot mark a Paystack payment-link booking as completed before payment is confirmed/,
    );
  });

  it("guard runs after the monthly-billing gate (so monthly path is unaffected)", () => {
    const src = readFileSync(join(root, "app/api/admin/bookings/route.ts"), "utf8");
    const monthlyGateIdx = src.indexOf("Paystack checkout is disabled");
    const guardIdx = src.indexOf("admin_mark_completed_unsafe_for_payment_link");
    expect(monthlyGateIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(monthlyGateIdx);
  });

  it("guard runs before processPaystackInitializeBody (no Paystack call when blocked)", () => {
    const src = readFileSync(join(root, "app/api/admin/bookings/route.ts"), "utf8");
    const guardIdx = src.indexOf("admin_mark_completed_unsafe_for_payment_link");
    const paystackInitIdx = src.indexOf("processPaystackInitializeBody(paystackBody");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(paystackInitIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(paystackInitIdx);
  });
});
