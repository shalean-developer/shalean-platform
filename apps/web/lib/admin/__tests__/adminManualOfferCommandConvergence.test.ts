import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const adminDir = path.resolve(__dirname, "..");
const command = path.join(adminDir, "adminManualBookingOfferCommand.ts");
const manualAssign = path.join(adminDir, "performAdminAssignToCleaner.ts");

const intentionallyUnmigrated = [
  path.resolve(__dirname, "../../../app/api/admin/bookings/[id]/route.ts"),
  path.resolve(__dirname, "../../cleaner/runCleanerBookingLifecycleAction.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/finalizeDueMonthlyInvoices.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/applyMonthlyInvoicePayment.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/markMonthlyInvoicePaidManual.ts"),
];

describe("admin manual offer command convergence (Phase 1D)", () => {
  it("owns the existing admin manual offered booking patch", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toMatch(/export\s+async\s+function\s+setAdminManualBookingOffered\s*\(/);
    expect(src).toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(\s*\{/);
    expect(src).toMatch(/cleaner_id:\s*null/);
    expect(src).toMatch(/status:\s*"offered"/);
    expect(src).toMatch(/dispatch_status:\s*"offered"/);
    expect(src).toMatch(/assigned_at:\s*null/);
    expect(src).toMatch(/accepted_at:\s*null/);
    expect(src).toContain("...BOOKING_PAYOUT_COLUMNS_CLEAR");
    expect(src).toMatch(/became_pending_at:\s*params\.nowIsoForPending/);
    expect(src).toMatch(/\.eq\("id",\s*params\.bookingId\)/);
  });

  it("migrates performAdminAssignToCleaner to the named command boundary", () => {
    const src = readFileSync(manualAssign, "utf8");

    expect(src).toContain("setAdminManualBookingOffered");
    expect(src).toMatch(/dispatchWasUnassignable,\s*[\r\n]+\s*nowIsoForPending,/);
    expect(src).not.toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(\s*\{[\s\S]*?status:\s*"offered"/);
    expect(src).not.toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(\s*\{[\s\S]*?dispatch_status:\s*"offered"/);
  });

  it("leaves generic admin PATCH, cleaner lifecycle, and monthly invoice flows out of Phase 1D", () => {
    for (const p of intentionallyUnmigrated) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} must not use admin manual offer command yet`).not.toContain(
        "setAdminManualBookingOffered",
      );
    }
  });
});
