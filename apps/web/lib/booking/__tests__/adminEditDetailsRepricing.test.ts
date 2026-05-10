import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin edit-details repricing slice (static guards)", () => {
  const libPath = join(process.cwd(), "lib/booking/adminEditBookingDetails.ts");

  it("executeRepricingAdminEditBookingDetails retains financial orchestration hooks", () => {
    const src = readFileSync(libPath, "utf8");
    const start = src.indexOf("async function executeRepricingAdminEditBookingDetails");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("export async function adminEditBookingDetailsNotesOnly", start);
    expect(end).toBeGreaterThan(start);
    const slice = src.slice(start, end);
    expect(slice).toContain("replace_booking_line_items_atomic");
    expect(slice).toContain("resetBookingCleanerLineEarnings");
    expect(slice).toContain("persistCleanerPayoutIfUnset");
    expect(slice).toContain("tryClaimNotificationDedupe");
    expect(slice).toMatch(/\.from\(\s*["']booking_changes["']\s*\)/);
    expect(slice).toContain("confirm_collect_additional");
    expect(slice).toContain("payment_mismatch");
  });

  it("adminRepriceBooking delegates without notification router or finalize", () => {
    const src = readFileSync(join(process.cwd(), "lib/booking/bookingOperations.ts"), "utf8");
    expect(src).toMatch(/export async function adminRepriceBooking[\s\S]*?return adminEditBookingDetailsRepricingOnly\(/);
    const idx = src.indexOf("export async function adminRepriceBooking");
    const nextExport = src.indexOf("\nexport ", idx + 5);
    const block = nextExport === -1 ? src.slice(idx) : src.slice(idx, nextExport);
    expect(block).not.toContain("routeBookingNotificationEvent");
    expect(block).not.toContain("finalizePaidBooking");
  });

  it("adminEditBookingDetailsRepricingOnly rejects bodies without pricing fields", () => {
    const src = readFileSync(libPath, "utf8");
    expect(src).toContain("adminEditBookingDetailsRepricingOnly");
    expect(src).toContain("Repricing requires bedrooms, bathrooms, and/or extras.");
  });
});
