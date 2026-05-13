import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const adminDir = path.resolve(__dirname, "..");
const command = path.join(adminDir, "adminBookingLifecycleStatusOverrideCommand.ts");
const adminPatchRoute = path.resolve(__dirname, "../../../app/api/admin/bookings/[id]/route.ts");

const intentionallyUnmigrated = [
  path.resolve(__dirname, "../../admin/performAdminAssignToCleaner.ts"),
  path.resolve(__dirname, "../../cleaner/runCleanerBookingLifecycleAction.ts"),
  path.resolve(__dirname, "../../booking/adminMarkBookingPaid.ts"),
  path.resolve(__dirname, "../../booking/upsertBookingFromPaystack.ts"),
  path.resolve(__dirname, "../../payout/backfillCompletedMissingDisplayEarnings.ts"),
  path.resolve(__dirname, "../../payout/repairCompletedStuckZeroDisplayFromSignals.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/finalizeDueMonthlyInvoices.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/applyMonthlyInvoicePayment.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/markMonthlyInvoicePaidManual.ts"),
];

describe("admin lifecycle status override command convergence (Phase 1E)", () => {
  it("owns the generic admin PATCH status override write shape", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toMatch(/export\s+async\s+function\s+applyAdminBookingLifecycleStatusOverride\s*\(/);
    expect(src).toMatch(/\.from\("bookings"\)\.update\(params\.updates\)\.eq\("id",\s*params\.bookingId\)/);
    expect(src).not.toMatch(/status:\s*["']/);
    expect(src).not.toContain("dispatch_status");
    expect(src).not.toContain("payout");
  });

  it("routes only status-bearing admin PATCH updates through the command", () => {
    const src = readFileSync(adminPatchRoute, "utf8");

    expect(src).toContain("applyAdminBookingLifecycleStatusOverride");
    expect(src).toMatch(/"status"\s+in\s+updates\s*\?[\s\S]*applyAdminBookingLifecycleStatusOverride\(\{\s*admin,\s*bookingId:\s*id,\s*updates\s*\}\)/);
    expect(src).toMatch(/:\s*await\s+admin\.from\("bookings"\)\.update\(updates\)\.eq\("id",\s*id\)/);
  });

  it("keeps the existing status validation and audit context in the admin PATCH route", () => {
    const src = readFileSync(adminPatchRoute, "utf8");

    expect(src).toContain('new Set(["pending", "assigned", "in_progress", "completed", "cancelled", "failed"])');
    expect(src).toContain('Invalid status.');
    expect(src).toContain("admin_booking_lifecycle_override");
    expect(src).toContain("admin_marked_completed_recurring_unpaid_pending_payment");
  });

  it("leaves assignment, cleaner lifecycle, payment finalization, payout repair, and monthly invoice flows out of Phase 1E", () => {
    for (const p of intentionallyUnmigrated) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} must not use admin lifecycle status override command`).not.toContain(
        "applyAdminBookingLifecycleStatusOverride",
      );
    }
  });
});
